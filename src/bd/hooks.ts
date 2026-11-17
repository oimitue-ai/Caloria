/**
 * Hooks de React con consultas "vivas" (useLiveQuery): se vuelven a ejecutar solas cuando
 * cambian los datos. Todas devuelven `undefined` mientras cargan.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ComidaId, Configuracion, Metas, Perfil, RegistroComida, RegistroPeso, Receta, Alimento } from '../tipos';
import type { EstadisticasRango, OpcionesEstadisticas, ResumenDia } from '../nucleo/estadisticas';
import { estadisticasRango } from '../nucleo/estadisticas';
import { resumenPeso, type OpcionesRitmo, type ResumenPeso } from '../nucleo/peso';
import { metaVigenteEn } from '../nucleo/metas';
import { listarFavoritos, listarAlimentosUsuario, listarFrecuentes, listarRecientes } from './alimentos';
import { estadoAlmacenamiento, type EstadoAlmacenamiento } from './almacenamiento';
import { historialMetas, obtenerConfig, obtenerPerfil } from './perfil';
import { listarPesos } from './pesos';
import { listarRecetas } from './recetas';
import { diasConRegistro, registrosEnRango, resumenDelDia } from './registros';
import type { Favorito, UsoAlimento } from './tipos';

/** Resumen del día: registros por comida, totales, meta vigente y restante. */
export function useDia(fecha: string): ResumenDia | undefined {
  return useLiveQuery(() => resumenDelDia(fecha), [fecha]);
}

/** Registros con fecha en [desde, hasta]. */
export function useRango(desde: string, hasta: string): RegistroComida[] | undefined {
  return useLiveQuery(() => registrosEnRango(desde, hasta), [desde, hasta]);
}

/** Estadísticas del rango (promedios, cumplimiento, serie diaria, semanas y meses). */
export function useEstadisticas(
  desde: string, hasta: string, opciones: OpcionesEstadisticas = {},
): EstadisticasRango | undefined {
  const clave = JSON.stringify(opciones);
  const datos = useLiveQuery(
    async () => ({ registros: await registrosEnRango(desde, hasta), metas: await historialMetas() }),
    [desde, hasta],
  );
  return useMemo(
    () => (datos ? estadisticasRango(datos.registros, datos.metas, desde, hasta, JSON.parse(clave)) : undefined),
    [datos, desde, hasta, clave],
  );
}

/** Pesos ordenados por fecha (opcionalmente en un rango). */
export function usePesos(desde?: string, hasta?: string): RegistroPeso[] | undefined {
  return useLiveQuery(() => listarPesos(desde, hasta), [desde, hasta]);
}

/** Resumen de peso (actual, variación, objetivo, tendencia, ritmo) con datos del perfil. */
export function useResumenPeso(opciones: OpcionesRitmo = {}): ResumenPeso | undefined {
  const clave = JSON.stringify(opciones);
  const datos = useLiveQuery(async () => ({ pesos: await listarPesos(), perfil: await obtenerPerfil() }), []);
  return useMemo(
    () => (datos ? resumenPeso(datos.pesos, datos.perfil, JSON.parse(clave)) : undefined),
    [datos, clave],
  );
}

/** Historial completo de metas (ascendente por `desde`). */
export function useMetas(): Metas[] | undefined {
  return useLiveQuery(() => historialMetas(), []);
}

/** Meta vigente en una fecha (`null` si no hay ninguna). */
export function useMetaVigente(fecha: string): Metas | null | undefined {
  const metas = useMetas();
  return useMemo(() => (metas ? metaVigenteEn(metas, fecha) : undefined), [metas, fecha]);
}

/** Perfil (`{}` si aún no se ha capturado). */
export function usePerfil(): Perfil | undefined {
  return useLiveQuery(() => obtenerPerfil(), []);
}

/** Recientes de una comida (o de todas), con su última cantidad/unidad. */
export function useRecientes(comida?: ComidaId, limite = 20): UsoAlimento[] | undefined {
  return useLiveQuery(() => listarRecientes(comida, limite), [comida, limite]);
}

/** Más usados en una comida (o en todas). */
export function useFrecuentes(comida?: ComidaId, limite = 20): UsoAlimento[] | undefined {
  return useLiveQuery(() => listarFrecuentes(comida, limite), [comida, limite]);
}

export function useFavoritos(): Favorito[] | undefined {
  return useLiveQuery(() => listarFavoritos(), []);
}

export function useRecetas(): Receta[] | undefined {
  return useLiveQuery(() => listarRecetas(), []);
}

export function useAlimentosUsuario(): Alimento[] | undefined {
  return useLiveQuery(() => listarAlimentosUsuario(), []);
}

/** Configuración con valores predeterminados aplicados. */
export function useConfig(): Configuracion | undefined {
  return useLiveQuery(() => obtenerConfig(), []);
}

/** Fechas del mes ('YYYY-MM') con al menos un registro, para marcar el calendario. */
export function useDiasConRegistro(mes: string): Set<string> | undefined {
  const lista = useLiveQuery(() => diasConRegistro(mes), [mes]);
  return useMemo(() => (lista ? new Set(lista) : undefined), [lista]);
}

/** Estado del almacenamiento (no es "vivo": se lee al montar y al llamar `actualizar`). */
export function useEstadoAlmacenamiento(): { estado: EstadoAlmacenamiento | undefined; actualizar: () => void } {
  const [estado, setEstado] = useState<EstadoAlmacenamiento>();
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    void estadoAlmacenamiento().then((e) => { if (vivo) setEstado(e); });
    return () => { vivo = false; };
  }, [n]);
  return { estado, actualizar: () => setN((x) => x + 1) };
}
