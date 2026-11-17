/**
 * Adaptador fino entre la interfaz y el catálogo (Agente 1, `src/catalogo`).
 * La UI solo usa lo que se exporta aquí.
 *
 * El módulo del catálogo se carga bajo demanda con `import.meta.glob`: queda en su propio
 * fragmento (no engorda el arranque) y, si todavía no existe, la app sigue funcionando con
 * tus alimentos, recetas y los ya usados en el dispositivo.
 */
import type {
  Alimento, ManifiestoCatalogo, OpcionesBusqueda, RespuestaBusqueda, ServicioCatalogo,
} from '../../tipos';

const modulos = import.meta.glob<{ catalogo: ServicioCatalogo; precargarCatalogoBase?: () => Promise<void> }>('../../catalogo/index.ts');

let servicio: Promise<ServicioCatalogo> | null = null;
let inicio: Promise<ManifiestoCatalogo | null> | null = null;

function cargarServicio(): Promise<ServicioCatalogo> {
  if (!servicio) {
    const cargar = modulos['../../catalogo/index.ts'];
    servicio = cargar
      ? cargar().then((m) => m.catalogo)
      : Promise.reject(new Error('El catálogo de alimentos no está disponible en esta versión.'));
    servicio.catch(() => { servicio = null; });
  }
  return servicio;
}

/** Inicia el catálogo una sola vez; nunca rechaza (sin red y sin caché → null). */
export function iniciarCatalogo(): Promise<ManifiestoCatalogo | null> {
  const actual = inicio ?? cargarServicio().then((c) => c.iniciar()).catch((e: unknown) => {
    console.warn('No se pudo iniciar el catálogo', e);
    inicio = null; // se reintenta en la siguiente búsqueda
    return null;
  });
  inicio = actual;
  return actual;
}

async function listo(): Promise<ServicioCatalogo> {
  const c = await cargarServicio();
  await iniciarCatalogo();
  return c;
}

export async function buscarEnCatalogo(texto: string, opciones: OpcionesBusqueda): Promise<RespuestaBusqueda> {
  return (await listo()).buscar(texto, opciones);
}

export async function obtenerDeCatalogo(id: string): Promise<Alimento | null> {
  return (await listo()).obtener(id);
}

export async function codigoEnCatalogo(codigo: string): Promise<Alimento | null> {
  return (await listo()).porCodigoBarras(codigo);
}

/** Manifiesto (fuentes, licencias y conteos): el del catálogo cargado o el archivo publicado. */
export async function leerManifiesto(): Promise<ManifiestoCatalogo | null> {
  try {
    const enMemoria = (await cargarServicio()).manifiesto();
    if (enMemoria) return enMemoria;
  } catch { /* se lee el archivo directamente */ }
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}catalogo/manifiesto.json`, { cache: 'no-cache' });
    if (!r.ok) return null;
    return (await r.json()) as ManifiestoCatalogo;
  } catch {
    return null;
  }
}

/**
 * Descarga en segundo plano los detalles del catálogo base (~2.5 MB comprimidos) para que cualquier alimento
 * genérico o mexicano se pueda abrir y registrar sin conexión (ARQUITECTURA: "base/ se descarga completo").
 * Sin esto solo se guardaban los índices: sin conexión se podía buscar pero no abrir un alimento no usado antes.
 * Respeta el ahorro de datos del sistema. Nunca rechaza. (Auditoría, Agente 4.)
 */
export async function precargarCatalogoEnSegundoPlano(): Promise<boolean> {
  const conexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (!navigator.onLine || conexion?.saveData) return false;
  try {
    const cargar = modulos['../../catalogo/index.ts'];
    if (!cargar || !(await iniciarCatalogo())) return false;
    const m = await cargar();
    if (!m.precargarCatalogoBase) return false;
    await m.precargarCatalogoBase();
    return true;
  } catch (e) {
    console.warn('No se pudo precargar el catálogo base', e);
    return false;
  }
}
