/** Perfil, historial de metas y configuración. */
import type { Configuracion, Metas, Perfil } from '../tipos';
import { ahoraISO, diasEntre, fechaLocal, hoy } from '../nucleo/fechas';
import { metaVigenteEn } from '../nucleo/metas';
import { bd, CLAVE_UNICA } from './esquema';
import { esquemaConfig, esquemaMetas, esquemaPerfil, validar } from './validacion';

// ───────────── Perfil ─────────────

/** Perfil guardado (`{}` si aún no hay). */
export async function obtenerPerfil(): Promise<Perfil> {
  return (await bd().perfil.get(CLAVE_UNICA)) ?? {};
}

/** Mezcla los cambios con el perfil actual. Un campo con `undefined` se elimina. */
export async function guardarPerfil(cambios: Partial<Perfil>): Promise<Perfil> {
  const b = bd();
  return b.transaction('rw', b.perfil, async () => {
    const mezcla: Record<string, unknown> = { ...((await b.perfil.get(CLAVE_UNICA)) ?? {}), ...cambios };
    for (const k of Object.keys(mezcla)) if (mezcla[k] === undefined) delete mezcla[k];
    const p = validar(esquemaPerfil, mezcla, 'Perfil');
    await b.perfil.put(p, CLAVE_UNICA);
    return p;
  });
}

// ───────────── Metas ─────────────

/**
 * Guarda una meta que aplica desde `desde` (por defecto hoy). Si ya había una con ese
 * `desde`, la reemplaza; las metas anteriores se conservan para evaluar días pasados.
 */
export async function guardarMetas(metas: Omit<Metas, 'desde'> & { desde?: string }): Promise<Metas> {
  const m = validar(esquemaMetas, { ...metas, desde: metas.desde ?? hoy() }, 'Meta');
  await bd().metas.put(m);
  return m;
}

/** Historial de metas, de la más antigua a la más reciente. */
export async function historialMetas(): Promise<Metas[]> {
  return bd().metas.orderBy('desde').toArray();
}

/** Meta vigente en una fecha (la de `desde` más reciente ≤ fecha), o `null`. */
export async function metasVigentes(fecha: string = hoy()): Promise<Metas | null> {
  return (await bd().metas.where('desde').belowOrEqual(fecha).last()) ?? null;
}

export async function eliminarMetas(desde: string): Promise<void> {
  await bd().metas.delete(desde);
}

export { metaVigenteEn };

// ───────────── Configuración ─────────────

export const CONFIG_PREDETERMINADA: Configuracion = { tema: 'sistema', recordarRespaldoDias: 7 };

export async function obtenerConfig(): Promise<Configuracion> {
  return { ...CONFIG_PREDETERMINADA, ...((await bd().config.get(CLAVE_UNICA)) ?? {}) };
}

/** Mezcla los cambios con la configuración actual. */
export async function guardarConfig(cambios: Partial<Configuracion>): Promise<Configuracion> {
  const b = bd();
  return b.transaction('rw', b.config, async () => {
    const mezcla: Record<string, unknown> = { ...CONFIG_PREDETERMINADA, ...((await b.config.get(CLAVE_UNICA)) ?? {}), ...cambios };
    for (const k of Object.keys(mezcla)) if (mezcla[k] === undefined) delete mezcla[k];
    const c = validar(esquemaConfig, mezcla, 'Configuración');
    await b.config.put(c, CLAVE_UNICA);
    return c;
  });
}

/** Anota la fecha (ISO) del último respaldo. */
export async function marcarRespaldo(fechaISO: string = ahoraISO()): Promise<void> {
  await guardarConfig({ ultimoRespaldo: fechaISO });
}

/**
 * ¿Toca recordar un respaldo? true si nunca se ha respaldado o pasaron más de
 * `recordarRespaldoDias` días (0 desactiva el recordatorio).
 */
export function respaldoPendiente(config: Configuracion, ahora: Date = new Date()): boolean {
  const dias = config.recordarRespaldoDias ?? CONFIG_PREDETERMINADA.recordarRespaldoDias!;
  if (dias <= 0) return false;
  if (!config.ultimoRespaldo) return true;
  const ultimo = new Date(config.ultimoRespaldo);
  if (Number.isNaN(ultimo.getTime())) return true;
  return diasEntre(fechaLocal(ultimo), fechaLocal(ahora)) >= dias;
}
