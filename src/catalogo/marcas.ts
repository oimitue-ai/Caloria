/**
 * Búsqueda de productos de marca en fragmentos remotos (USDA Branded, Open Food Facts por separado).
 * 1) vocabulario por prefijo (directorio de frecuencias) → df de cada término y corrección difusa;
 * 2) se descarga solo el índice del término MÁS RARO de la consulta;
 * 3) el resto de los términos se verifican sobre el nombre/marca de cada fila.
 */
import type { Alimento, FuenteId, ResultadoBusqueda } from '../tipos.ts';
import { analizarConsulta, type GrupoConsulta } from './consulta.ts';
import { fonetica, hash32, normalizarCodigoBarras, tokenizar } from './normalizar.ts';
import { resolverToken, type TerminoResuelto, type Vocabulario } from './terminos.ts';
import { revisarSenal, type Cargador } from './red.ts';

export type FuenteMarcas = 'usda_branded' | 'off';
/** [idOriginal, nombre, marca, kcal, banderas (1 = ml, 2 = mexicano, 4 = atípico)] */
type FilaMarca = [string, string, string, number | null, number];
type EntradaVocab = [number, string, number, number]; // df, clave de archivo, partes, df como marca

const VALIDACION: Record<FuenteMarcas, 'etiqueta' | 'comunidad'> = { usda_branded: 'etiqueta', off: 'comunidad' };

function claveVocab(t: string, prefijos: Set<string>): string | null {
  if (prefijos.has(t + '_')) return t + '_';
  for (let L = Math.min(t.length, 12); L >= 1; L--) if (prefijos.has(t.slice(0, L))) return t.slice(0, L);
  return null;
}

export class BuscadorMarcas {
  private directorio: Promise<{ prefijos: Set<string>; lista: string[] }> | null = null;
  private info: Promise<{ cubetasDetalle: number }> | null = null;
  readonly fuente: FuenteMarcas;
  private cargar: Cargador;
  constructor(fuente: FuenteMarcas, cargar: Cargador) {
    this.fuente = fuente;
    this.cargar = cargar;
  }

  private dir(senal?: AbortSignal) {
    this.directorio ??= (this.cargar(`marcas/${this.fuente}/terminos/_directorio.json`, senal) as Promise<{ prefijos: string[] } | null>).then((d) => ({
      prefijos: new Set(d?.prefijos ?? []),
      lista: d?.prefijos ?? [],
    }));
    this.directorio.catch(() => (this.directorio = null));
    return this.directorio;
  }

  /** Vocabulario (parcial) que cubre los términos con este prefijo. */
  private async vocabPara(t: string, prefijo: boolean, senal?: AbortSignal): Promise<Map<string, EntradaVocab>> {
    const { prefijos, lista } = await this.dir(senal);
    const claves = new Set<string>();
    const k = claveVocab(t, prefijos);
    if (k) claves.add(k);
    if (prefijo && t.length >= 2) {
      // al teclear, los términos que empiezan con t pueden estar repartidos en subprefijos
      for (const p of lista) if (p.startsWith(t) && claves.size < 5) claves.add(p);
    }
    const m = new Map<string, EntradaVocab>();
    const archivos = await Promise.all([...claves].map((c) => this.cargar(`marcas/${this.fuente}/terminos/${c}.json`, senal) as Promise<Record<string, EntradaVocab> | null>));
    for (const a of archivos) if (a) for (const [x, v] of Object.entries(a)) m.set(x, v);
    return m;
  }

  private vocabulario(m: Map<string, EntradaVocab>): Vocabulario {
    let fon: Map<string, string[]> | null = null;
    return {
      df: (t) => m.get(t)?.[0] ?? 0,
      conPrefijo: (p, max) =>
        [...m.keys()]
          .filter((x) => x.startsWith(p))
          .sort((a, b) => m.get(b)![0] - m.get(a)![0])
          .slice(0, max),
      candidatos: (t) => [...m.keys()].filter((x) => Math.abs(x.length - t.length) <= 2),
      porFonetica: (k) => {
        if (!fon) {
          fon = new Map();
          for (const x of m.keys()) {
            const f = fonetica(x);
            const l = fon.get(f) ?? [];
            l.push(x);
            fon.set(f, l);
          }
        }
        return fon.get(k);
      },
    };
  }

  async buscar(texto: string, necesarios: number, senal?: AbortSignal): Promise<{ resultados: ResultadoBusqueda[]; hayMas: boolean }> {
    const grupos = analizarConsulta(texto);
    if (!grupos.length) return { resultados: [], hayMas: false };
    // resolver cada token de cada alternativa contra el vocabulario remoto
    type GrupoResuelto = { g: GrupoConsulta; alts: { peso: number; tokens: TerminoResuelto[][] }[]; df: number };
    const resueltos: GrupoResuelto[] = [];
    const vocabTotal = new Map<string, EntradaVocab>();
    for (const g of grupos) {
      const alts: GrupoResuelto['alts'] = [];
      let dfGrupo = 0;
      for (const alt of g.alternativas) {
        const toks: TerminoResuelto[][] = [];
        for (let i = 0; i < alt.tokens.length; i++) {
          const t = alt.tokens[i];
          const pref = g.prefijo && i === alt.tokens.length - 1 && alt.peso === 1;
          const m = await this.vocabPara(t, pref, senal);
          for (const [k, v] of m) vocabTotal.set(k, v);
          toks.push(resolverToken(t, this.vocabulario(m), pref).slice(0, pref ? 6 : 4));
        }
        if (toks.every((x) => x.length)) {
          alts.push({ peso: alt.peso, tokens: toks });
          // df de la alternativa ≈ el de su token más raro
          dfGrupo += Math.min(...toks.map((x) => x.reduce((s, r) => s + (vocabTotal.get(r.termino)?.[0] ?? 0), 0)));
        }
      }
      resueltos.push({ g, alts, df: dfGrupo });
    }
    const satisfacibles = resueltos.filter((r) => r.alts.length);
    if (!satisfacibles.length) return { resultados: [], hayMas: false };
    // grupo más raro → sus términos (de la alternativa) son los que se descargan
    const raro = satisfacibles.reduce((a, b) => (b.df < a.df ? b : a));
    const terminosDescarga = new Map<string, number>();
    for (const alt of raro.alts) {
      // por alternativa, el token más raro
      const masRaro = alt.tokens.reduce((a, b) => (sumaDf(b, vocabTotal) < sumaDf(a, vocabTotal) ? b : a));
      for (const r of masRaro) terminosDescarga.set(r.termino, Math.max(terminosDescarga.get(r.termino) ?? 0, r.peso * alt.peso));
    }
    const filas = new Map<string, FilaMarca>();
    let hayMas = false;
    for (const [termino] of [...terminosDescarga].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      const v = vocabTotal.get(termino);
      if (!v) continue;
      const [, clave, partes] = v;
      for (let parte = 0; parte < partes; parte++) {
        revisarSenal(senal);
        const ruta = partes > 1 ? `marcas/${this.fuente}/indice/${clave}.${parte}.json` : `marcas/${this.fuente}/indice/${clave}.json`;
        const frag = (await this.cargar(ruta, senal)) as Record<string, FilaMarca[]> | null;
        for (const f of frag?.[termino] ?? []) filas.set(f[0], f);
        if (filas.size >= Math.max(400, necesarios * 8)) {
          hayMas ||= parte < partes - 1;
          break;
        }
      }
    }
    // verificar el resto de los grupos y puntuar
    const resultados: ResultadoBusqueda[] = [];
    for (const f of filas.values()) {
      const tn = tokenizar(f[1]);
      const tm = new Set(tokenizar(f[2]));
      let suma = 0;
      let n = 0;
      let enMarca = false;
      const tns = new Set(tn);
      for (const r of resueltos) {
        let mejor = 0;
        for (const alt of r.alts) {
          let pAlt = alt.peso;
          for (const opciones of alt.tokens) {
            let pTok = 0;
            for (const o of opciones) {
              const enNombre = tns.has(o.termino) || (r.g.prefijo && tn.some((x) => x.startsWith(o.termino)));
              const enLaMarca = tm.has(o.termino) || (r.g.prefijo && [...tm].some((x) => x.startsWith(o.termino)));
              if (!enNombre && !enLaMarca) continue;
              // coincidir solo en la marca vale algo menos que en el nombre
              pTok = Math.max(pTok, o.peso * (enNombre ? 1 : 0.85));
              const v = vocabTotal.get(o.termino);
              // prioridad de marca solo si el término es mayormente un nombre de marca ("lala", "bimbo")
              if (alt.peso === 1 && o.peso === 1 && tm.has(o.termino) && v && v[3] / Math.max(1, v[0]) >= 0.5) enMarca = true;
            }
            pAlt = Math.min(pAlt, pTok);
          }
          mejor = Math.max(mejor, pAlt);
        }
        if (mejor > 0) {
          suma += mejor;
          n++;
        }
      }
      if (n < grupos.length && (grupos.length < 3 || n < grupos.length - 1)) continue;
      let p = (suma / grupos.length) * 2 - 0.6 * (grupos.length - n);
      p += 0.6 / (1 + Math.max(0, tn.length - grupos.length) * 0.35);
      if (enMarca) p += 1;
      if (f[4] & 2) p += 0.15;
      if (f[4] & 4) p -= 0.15;
      p += this.fuente === 'off' ? -0.12 : -0.1;
      resultados.push(this.resultado(f, Math.round(p * 1000) / 1000));
    }
    resultados.sort((a, b) => b.puntuacion - a.puntuacion || a.nombre.length - b.nombre.length);
    return { resultados, hayMas: hayMas || resultados.length > necesarios };
  }

  private resultado(f: FilaMarca, puntuacion: number): ResultadoBusqueda {
    return {
      id: `${this.fuente}:${f[0]}`,
      nombre: f[1],
      marca: f[2] || undefined,
      fuente: this.fuente as FuenteId,
      validacion: VALIDACION[this.fuente],
      base: f[4] & 1 ? 'ml' : 'g',
      kcal: f[3] ?? undefined,
      mexicano: f[4] & 2 ? true : undefined,
      puntuacion,
    };
  }

  async obtener(idOriginal: string, senal?: AbortSignal): Promise<Alimento | null> {
    this.info ??= this.cargar(`marcas/${this.fuente}/info.json`, senal) as Promise<{ cubetasDetalle: number }>;
    this.info.catch(() => (this.info = null));
    const info = await this.info;
    if (!info) return null;
    const h = hash32(idOriginal) % info.cubetasDetalle;
    const frag = (await this.cargar(`marcas/${this.fuente}/detalle/${h}.json`, senal)) as Record<string, Record<string, unknown>> | null;
    const d = frag?.[idOriginal];
    if (!d) return null;
    const { nO, ...resto } = d as { nO?: number } & Record<string, unknown>;
    const nombre = resto.nombre as string;
    return {
      id: `${this.fuente}:${idOriginal}`,
      fuente: this.fuente,
      idOriginal,
      validacion: VALIDACION[this.fuente],
      idiomaOriginal: this.fuente === 'off' ? 'es' : 'en',
      nombreOriginal: nO === 1 ? nombre.toUpperCase() : nO === 2 ? nombre : (resto.nombreOriginal as string),
      ...resto,
    } as Alimento;
  }
}

function sumaDf(opciones: TerminoResuelto[], v: Map<string, EntradaVocab>) {
  return opciones.reduce((s, r) => s + (v.get(r.termino)?.[0] ?? 0), 0);
}

/** Índice de códigos de barras (común a todas las fuentes de marcas). */
export class IndiceCodigos {
  private dir: Promise<string[]> | null = null;
  private cargar: Cargador;
  constructor(cargar: Cargador) {
    this.cargar = cargar;
  }
  async ids(codigo: string): Promise<string[]> {
    const g = normalizarCodigoBarras(codigo);
    if (!g) return [];
    this.dir ??= (this.cargar('marcas/codigos/_directorio.json') as Promise<{ prefijos: string[] } | null>).then((d) => d?.prefijos ?? []);
    this.dir.catch(() => (this.dir = null));
    const prefijos = new Set(await this.dir);
    const clave = claveVocab(g, prefijos);
    if (!clave) return [];
    const frag = (await this.cargar(`marcas/codigos/${clave}.json`)) as Record<string, string[]> | null;
    return frag?.[g] ?? [];
  }
}
