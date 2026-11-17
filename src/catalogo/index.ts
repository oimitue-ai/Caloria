/**
 * Servicio del catálogo nutricional (Agente 1). Uso: ver docs/API_CATALOGO.md.
 *   import { catalogo } from './catalogo';
 */
import type { Alimento, ManifiestoCatalogo, OpcionesBusqueda, RespuestaBusqueda, ResultadoBusqueda, ServicioCatalogo } from '../tipos.ts';
import { NucleoBase, type InfoBase } from './base.ts';
import { BuscadorMarcas, IndiceCodigos, type FuenteMarcas } from './marcas.ts';
import { abortar, crearCargadorHttp, esAbortado, limpiarCachesViejas, revisarSenal, type Cargador } from './red.ts';
import { normalizarCodigoBarras } from './normalizar.ts';

export { normalizar, tokenizar, normalizarCodigoBarras } from './normalizar.ts';
export type { Cargador } from './red.ts';

/** Manifiesto publicado (ManifiestoCatalogo + datos de formato y estadísticas). */
export interface ManifiestoPublicado extends ManifiestoCatalogo {
  formato: number;
  base: { registros: number; indices: string[]; detalles: string[]; mexicanos: number };
  marcas?: { fuentes: Record<string, { productos: number }> };
  [k: string]: unknown;
}

const FUENTES_BASE = new Set(['usda_foundation', 'usda_sr_legacy', 'usda_fndds', 'caloria_recetas', 'mx_conabio', 'mx_bam']);

interface MotorRemoto {
  buscar(texto: string, limite: number, pagina: number): Promise<{ resultados: ResultadoBusqueda[]; total: number }>;
  obtener(id: string): Promise<Alimento | null>;
  precargar(): Promise<void>;
}

function urlCatalogo(): string {
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? '/';
  if (typeof document !== 'undefined') return new URL(base + 'catalogo/', document.baseURI).href;
  if (typeof location !== 'undefined') return new URL(base + 'catalogo/', location.href).href;
  return base + 'catalogo/';
}

/** Motor base dentro de un Web Worker (con respuesta por número de mensaje). */
function motorEnWorker(urlBase: string, version: string, info: InfoBase): Promise<MotorRemoto> {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let n = 0;
  const pendientes = new Map<number, { ok: (v: unknown) => void; mal: (e: Error) => void }>();
  w.onmessage = (ev) => {
    const { n: k, ok, r, error, nombre } = ev.data;
    const p = pendientes.get(k);
    if (!p) return;
    pendientes.delete(k);
    if (ok) p.ok(r);
    else {
      const e = new Error(error);
      e.name = nombre ?? 'Error';
      p.mal(e);
    }
  };
  const llamar = <T,>(m: Record<string, unknown>): Promise<T> =>
    new Promise((ok, mal) => {
      const k = ++n;
      pendientes.set(k, { ok: ok as (v: unknown) => void, mal });
      w.postMessage({ ...m, n: k });
    });
  w.onerror = (e) => {
    for (const p of pendientes.values()) p.mal(new Error(e.message || 'error en el worker del catálogo'));
    pendientes.clear();
  };
  return llamar<number>({ tipo: 'iniciar', urlBase, version, info }).then(() => ({
    buscar: (texto, limite, pagina) => llamar({ tipo: 'buscar', texto, limite, pagina }),
    obtener: (id) => llamar({ tipo: 'obtener', id }),
    precargar: () => llamar({ tipo: 'precargar' }),
  }));
}

export interface OpcionesServicio {
  /** cargador de archivos (pruebas); por defecto HTTP + Cache Storage */
  cargador?: Cargador;
  /** usar Web Worker para el catálogo base (por defecto: sí, si existe `Worker`) */
  usarWorker?: boolean;
  /** URL base del catálogo; por defecto import.meta.env.BASE_URL + 'catalogo/' */
  urlBase?: string;
}

export class ServicioCatalogoLocal implements ServicioCatalogo {
  private man: ManifiestoPublicado | null = null;
  private inicio: Promise<ManifiestoCatalogo> | null = null;
  private base: MotorRemoto | null = null;
  private marcas: BuscadorMarcas[] = [];
  private codigos: IndiceCodigos | null = null;
  private cargar: Cargador;
  private version = 'v0';
  private urlBase: string;

  private opciones: OpcionesServicio;
  constructor(opciones: OpcionesServicio = {}) {
    this.opciones = opciones;
    this.urlBase = opciones.urlBase ?? urlCatalogo();
    this.cargar = opciones.cargador ?? crearCargadorHttp(this.urlBase, () => this.version);
  }

  iniciar(): Promise<ManifiestoCatalogo> {
    this.inicio ??= (async () => {
      const m = (await this.cargar('manifiesto.json')) as ManifiestoPublicado | null;
      if (!m) throw new Error('No se encontró catalogo/manifiesto.json');
      this.man = m;
      this.version = m.version;
      void limpiarCachesViejas(m.version).catch(() => undefined);
      const info: InfoBase = { indices: m.base.indices, detalles: m.base.detalles };
      const usarWorker = this.opciones.usarWorker ?? (typeof Worker !== 'undefined' && typeof window !== 'undefined' && !this.opciones.cargador);
      if (usarWorker) {
        try {
          this.base = await motorEnWorker(this.urlBase, m.version, info);
        } catch {
          this.base = null; // respaldo en hilo principal
        }
      }
      if (!this.base) {
        const nucleo = new NucleoBase(this.cargar, info);
        await nucleo.iniciar();
        this.base = nucleo;
      }
      const fuentesMarcas = Object.keys(m.marcas?.fuentes ?? {}) as FuenteMarcas[];
      this.marcas = fuentesMarcas.map((f) => new BuscadorMarcas(f, this.cargar));
      this.codigos = new IndiceCodigos(this.cargar);
      return m;
    })();
    this.inicio.catch(() => (this.inicio = null));
    return this.inicio;
  }

  manifiesto(): ManifiestoCatalogo | null {
    return this.man;
  }

  async buscar(texto: string, opciones: OpcionesBusqueda = {}): Promise<RespuestaBusqueda> {
    const senal = opciones.senal;
    revisarSenal(senal);
    if (!texto || !texto.trim()) return { resultados: [], hayMas: false };
    await this.iniciar();
    revisarSenal(senal);
    const limite = Math.max(1, opciones.limite ?? 25);
    const pagina = Math.max(0, opciones.pagina ?? 0);
    const necesarios = (pagina + 1) * limite;
    const pBase = this.base!.buscar(texto, necesarios, 0);
    const pMarcas = opciones.incluirMarcas === false ? [] : this.marcas.map((m) => m.buscar(texto, necesarios, senal));
    const [rBase, ...rMarcas] = await Promise.allSettled([pBase, ...pMarcas]);
    revisarSenal(senal);
    if (rBase.status === 'rejected') throw rBase.reason;
    let parcial = false;
    let hayMasMarcas = false;
    const todos: ResultadoBusqueda[] = [...rBase.value.resultados];
    for (const r of rMarcas) {
      if (r.status === 'fulfilled') {
        todos.push(...(r.value as { resultados: ResultadoBusqueda[] }).resultados);
        hayMasMarcas ||= (r.value as { hayMas: boolean }).hayMas;
      } else if (esAbortado(r.reason)) throw abortar();
      else parcial = true;
    }
    todos.sort((a, b) => b.puntuacion - a.puntuacion || a.nombre.length - b.nombre.length);
    const resultados = todos.slice(pagina * limite, necesarios);
    const hayMas = todos.length > necesarios || rBase.value.total > necesarios || hayMasMarcas;
    return parcial ? { resultados, hayMas, parcial } : { resultados, hayMas };
  }

  async obtener(id: string): Promise<Alimento | null> {
    await this.iniciar();
    const i = id.indexOf(':');
    if (i < 0) return null;
    const fuente = id.slice(0, i);
    try {
      if (FUENTES_BASE.has(fuente)) return await this.base!.obtener(id);
      const b = this.marcas.find((m) => m.fuente === fuente);
      return b ? await b.obtener(id.slice(i + 1)) : null;
    } catch (e) {
      if (esAbortado(e)) throw e;
      return null;
    }
  }

  async porCodigoBarras(codigo: string): Promise<Alimento | null> {
    await this.iniciar();
    const g = normalizarCodigoBarras(codigo);
    if (!g || !this.codigos) return null;
    let ids: string[];
    try {
      ids = await this.codigos.ids(g);
    } catch {
      return null;
    }
    if (!ids.length) return null;
    // productos registrados en México (prefijo 750): primero Open Food Facts México; si no, la etiqueta USDA
    const orden = g.startsWith('750') ? ['off', 'usda_branded'] : ['usda_branded', 'off'];
    ids = [...ids].sort((a, b) => orden.indexOf(a.split(':')[0]) - orden.indexOf(b.split(':')[0]));
    for (const id of ids) {
      const a = await this.obtener(id);
      if (a) return a;
    }
    return null;
  }

  /** Descarga y cachea todo el catálogo base (genéricos + recetas) para uso sin conexión. */
  async precargarBase(): Promise<void> {
    await this.iniciar();
    await this.base!.precargar();
  }
}

export function crearServicioCatalogo(opciones?: OpcionesServicio): ServicioCatalogoLocal {
  return new ServicioCatalogoLocal(opciones);
}

/** Instancia única que usa la interfaz. */
export const catalogo: ServicioCatalogo & { precargarBase(): Promise<void> } = new ServicioCatalogoLocal();

export function precargarCatalogoBase(): Promise<void> {
  return catalogo.precargarBase();
}
