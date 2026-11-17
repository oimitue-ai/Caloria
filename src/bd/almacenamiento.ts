/** Almacenamiento persistente del navegador (evita que el sistema borre los datos por falta de espacio). */

export interface EstadoAlmacenamiento {
  /** false si el navegador no expone la API de almacenamiento */
  soportado: boolean;
  /** true = el navegador no borrará los datos automáticamente; null = desconocido */
  persistente: boolean | null;
  usoBytes: number | null;
  cuotaBytes: number | null;
  /** uso / cuota, 0–1 */
  proporcionUsada: number | null;
}

const api = (): StorageManager | undefined =>
  (typeof navigator !== 'undefined' ? navigator.storage : undefined);

/**
 * Pide almacenamiento persistente. Devuelve true si se concedió (o ya lo estaba), false si se
 * negó y null si el navegador no lo soporta. Llamar tras una interacción del usuario mejora la
 * probabilidad de que se conceda en algunos navegadores.
 */
export async function solicitarPersistencia(): Promise<boolean | null> {
  const s = api();
  if (!s?.persist) return null;
  try {
    if (s.persisted && (await s.persisted())) return true;
    return await s.persist();
  } catch {
    return null;
  }
}

export async function estadoAlmacenamiento(): Promise<EstadoAlmacenamiento> {
  const s = api();
  if (!s) return { soportado: false, persistente: null, usoBytes: null, cuotaBytes: null, proporcionUsada: null };
  let persistente: boolean | null = null;
  let usoBytes: number | null = null;
  let cuotaBytes: number | null = null;
  try { if (s.persisted) persistente = await s.persisted(); } catch { /* sin dato */ }
  try {
    if (s.estimate) {
      const e = await s.estimate();
      usoBytes = e.usage ?? null;
      cuotaBytes = e.quota ?? null;
    }
  } catch { /* sin dato */ }
  return {
    soportado: true,
    persistente,
    usoBytes,
    cuotaBytes,
    proporcionUsada: usoBytes !== null && cuotaBytes ? usoBytes / cuotaBytes : null,
  };
}

/** "12.3 MB" */
export function formatearBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString('es-MX', { maximumFractionDigits: i === 0 ? 0 : 1 })} ${u[i]}`;
}
