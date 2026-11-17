/**
 * Carga de archivos del catálogo con caché en memoria + Cache Storage (sin conexión).
 * Funciona en el hilo principal y en el Web Worker. Las pruebas inyectan un cargador propio.
 */
export type Cargador = (ruta: string, senal?: AbortSignal) => Promise<unknown>;

export class ErrorSinConexion extends Error {
  constructor(ruta: string, causa?: unknown) {
    super(`No se pudo descargar ${ruta}`);
    this.name = 'ErrorSinConexion';
    (this as { cause?: unknown }).cause = causa;
  }
}

export function esAbortado(e: unknown): boolean {
  return (e as { name?: string })?.name === 'AbortError';
}

export function abortar(): DOMException {
  return new DOMException('Búsqueda cancelada', 'AbortError');
}

export function revisarSenal(s?: AbortSignal) {
  if (s?.aborted) throw abortar();
}

const PREFIJO_CACHE = 'caloria-catalogo-';

/** Cargador por HTTP: memoria → Cache Storage → red (y guarda en Cache Storage). */
export function crearCargadorHttp(urlBase: string, version: () => string, maxMemoria = 400): Cargador {
  const memoria = new Map<string, unknown>();
  const enCurso = new Map<string, Promise<unknown>>();
  const recordar = (k: string, v: unknown) => {
    memoria.set(k, v);
    if (memoria.size > maxMemoria) memoria.delete(memoria.keys().next().value!);
  };
  return async (ruta, senal) => {
    revisarSenal(senal);
    const k = ruta;
    if (memoria.has(k)) return memoria.get(k);
    let p = enCurso.get(k);
    if (!p) {
      p = (async () => {
        const url = urlBase + ruta;
        const esManifiesto = ruta === 'manifiesto.json';
        const nombreCache = esManifiesto ? PREFIJO_CACHE + 'manifiesto' : PREFIJO_CACHE + version();
        const cache = typeof caches !== 'undefined' ? await caches.open(nombreCache).catch(() => null) : null;
        if (cache && !esManifiesto) {
          const r = await cache.match(url).catch(() => undefined);
          if (r) return r.json();
        }
        try {
          const r = await fetch(url, esManifiesto ? { cache: 'no-cache' } : undefined);
          if (!r.ok) {
            if (r.status === 404) return null;
            throw new Error(`HTTP ${r.status}`);
          }
          if (cache) await cache.put(url, r.clone()).catch(() => undefined);
          return r.json();
        } catch (e) {
          if (cache && esManifiesto) {
            const r = await cache.match(url).catch(() => undefined);
            if (r) return r.json();
          }
          throw new ErrorSinConexion(ruta, e);
        }
      })().finally(() => enCurso.delete(k));
      enCurso.set(k, p);
    }
    const v = await p;
    recordar(k, v);
    revisarSenal(senal);
    return v;
  };
}

/** Borra cachés de versiones anteriores del catálogo. */
export async function limpiarCachesViejas(versionActual: string) {
  if (typeof caches === 'undefined') return;
  for (const k of await caches.keys()) {
    if (k.startsWith(PREFIJO_CACHE) && k !== PREFIJO_CACHE + versionActual && k !== PREFIJO_CACHE + 'manifiesto') await caches.delete(k);
  }
}
