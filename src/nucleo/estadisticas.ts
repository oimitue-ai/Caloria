/**
 * Estadísticas de consumo por rango de fechas.
 *
 * Reglas:
 *  - Un día SIN registros es `null` (no se sabe qué comió) y NO entra en promedios.
 *    Un día con registros que suman 0 kcal sí es un día registrado con total 0.
 *  - Los promedios se calculan sobre los días registrados, no sobre los días del periodo.
 *  - Cumplimiento de un día: cada nutriente evaluado (por defecto solo kcal) está dentro de
 *    ±tolerancia (por defecto 10 %) de la meta VIGENTE ese día (historial por `desde`).
 *    Sin registro o sin meta vigente → `cumple: null` (no cuenta como incumplido).
 */
import type { ComidaId, Metas, RegistroComida, Totales } from '../tipos';
import { COMIDAS } from '../tipos';
import { escalarTotales, limpiar, promediarTotales, sumarTotales, totalesCero } from './calculo';
import type { ClavePrincipal } from './calculo';
import { metaVigenteEn } from './metas';
import { mesesEnRango, rangoFechas, semanasEnRango } from './fechas';

export type RegistroParaEstadistica = Pick<RegistroComida, 'fecha' | 'comida' | 'totales'>;

export interface OpcionesEstadisticas {
  /** fracción aceptada alrededor de la meta (por defecto 0.10 = ±10 %) */
  tolerancia?: number;
  /** nutrientes que deben cumplirse (por defecto ['kcal']) */
  nutrientes?: ClavePrincipal[];
  /** si se indica, los días posteriores a `hoy` no cuentan en `diasPeriodo` ni en la serie */
  hoy?: string;
}

export interface DiaEstadistica {
  fecha: string;
  /** false = sin registros (dato desconocido) */
  registrado: boolean;
  registros: number;
  /** null si no hay registros; puede ser todo 0 si se registraron alimentos sin energía */
  totales: Totales | null;
  meta: Metas | null;
  /** null si no hay registros o no hay meta vigente */
  cumple: boolean | null;
  /** consumo / meta en kcal (1 = exacto); null si no aplica */
  proporcionMeta: number | null;
}

export interface ResumenPeriodoEst {
  inicio: string;
  fin: string;
  /** días del periodo que caen dentro del rango consultado (y no después de `hoy`) */
  diasPeriodo: number;
  diasRegistrados: number;
  /** promedio diario sobre días registrados; null si ninguno */
  promedio: Totales | null;
  /** suma del periodo (solo días registrados) */
  total: Totales;
  diasConMeta: number;
  diasCumplidos: number;
  /** diasCumplidos / días registrados con meta; null si no hay ninguno */
  cumplimiento: number | null;
  /** promedio de la meta de kcal vigente en los días registrados */
  metaKcalPromedio: number | null;
}

export interface EstadisticasRango extends ResumenPeriodoEst {
  desde: string;
  hasta: string;
  serie: DiaEstadistica[];
  semanas: ResumenPeriodoEst[];
  meses: (ResumenPeriodoEst & { mes: string })[];
  /** promedio diario por comida sobre los días registrados */
  promedioPorComida: Record<ComidaId, Totales>;
  /** racha actual de días consecutivos registrados que termina en el último día de la serie */
  rachaActual: number;
  rachaMaxima: number;
}

/** Suma de totales por día. */
export function totalesPorDia(registros: readonly RegistroParaEstadistica[]): Map<string, { totales: Totales; n: number }> {
  const listas = new Map<string, Totales[]>();
  for (const r of registros) {
    const l = listas.get(r.fecha);
    if (l) l.push(r.totales);
    else listas.set(r.fecha, [r.totales]);
  }
  const m = new Map<string, { totales: Totales; n: number }>();
  for (const [f, l] of listas) m.set(f, { totales: sumarTotales(l), n: l.length });
  return m;
}

/** ¿El valor está dentro de ±tolerancia de la meta? (meta 0 o negativa: no evaluable) */
export function dentroDeMeta(valor: number, meta: number, tolerancia = 0.1): boolean | null {
  if (!(meta > 0)) return null;
  return Math.abs(valor - meta) <= meta * tolerancia + 1e-9;
}

export function evaluarDia(
  totales: Totales | null, meta: Metas | null, opciones: OpcionesEstadisticas = {},
): boolean | null {
  if (!totales || !meta) return null;
  const tol = opciones.tolerancia ?? 0.1;
  let evaluados = 0;
  for (const c of opciones.nutrientes ?? ['kcal']) {
    const r = dentroDeMeta(totales[c], meta[c], tol);
    if (r === null) continue;
    evaluados++;
    if (!r) return false;
  }
  return evaluados > 0 ? true : null;
}

/** Serie diaria (un elemento por día del rango, incluidos los días sin registro). */
export function serieDiaria(
  registros: readonly RegistroParaEstadistica[], historialMetas: readonly Metas[],
  desde: string, hasta: string, opciones: OpcionesEstadisticas = {},
): DiaEstadistica[] {
  const fin = opciones.hoy && opciones.hoy < hasta ? opciones.hoy : hasta;
  const porDia = totalesPorDia(registros.filter((r) => r.fecha >= desde && r.fecha <= fin));
  return rangoFechas(desde, fin).map((fecha) => {
    const d = porDia.get(fecha);
    const meta = metaVigenteEn(historialMetas as Metas[], fecha);
    const totales = d ? d.totales : null;
    return {
      fecha,
      registrado: !!d,
      registros: d?.n ?? 0,
      totales,
      meta,
      cumple: evaluarDia(totales, meta, opciones),
      proporcionMeta: totales && meta && meta.kcal > 0 ? limpiar(totales.kcal / meta.kcal) : null,
    };
  });
}

function resumirDias(dias: DiaEstadistica[], inicio: string, fin: string): ResumenPeriodoEst {
  const registrados = dias.filter((d) => d.registrado);
  const totales = registrados.map((d) => d.totales!);
  const conMeta = registrados.filter((d) => d.cumple !== null);
  const metas = registrados.filter((d) => d.meta).map((d) => d.meta!.kcal);
  return {
    inicio,
    fin,
    diasPeriodo: dias.length,
    diasRegistrados: registrados.length,
    promedio: promediarTotales(totales),
    total: totales.length ? sumarTotales(totales) : totalesCero(),
    diasConMeta: conMeta.length,
    diasCumplidos: conMeta.filter((d) => d.cumple).length,
    cumplimiento: conMeta.length ? limpiar(conMeta.filter((d) => d.cumple).length / conMeta.length) : null,
    metaKcalPromedio: metas.length ? limpiar(metas.reduce((a, b) => a + b, 0) / metas.length) : null,
  };
}

function rachas(dias: DiaEstadistica[]): { actual: number; maxima: number } {
  let actual = 0;
  let maxima = 0;
  for (const d of dias) {
    actual = d.registrado ? actual + 1 : 0;
    if (actual > maxima) maxima = actual;
  }
  return { actual, maxima };
}

/**
 * Estadísticas completas del rango [desde, hasta] (ambos incluidos).
 * `semanas` (lunes–domingo) y `meses` se recortan al rango consultado.
 */
export function estadisticasRango(
  registros: readonly RegistroParaEstadistica[], historialMetas: readonly Metas[],
  desde: string, hasta: string, opciones: OpcionesEstadisticas = {},
): EstadisticasRango {
  const serie = serieDiaria(registros, historialMetas, desde, hasta, opciones);
  const fin = serie.length ? serie[serie.length - 1].fecha : hasta;
  const recortar = (i: string, f: string) => serie.filter((d) => d.fecha >= i && d.fecha <= f);

  const semanas = semanasEnRango(desde, fin).map(({ inicio, fin: f }) => {
    const i2 = inicio < desde ? desde : inicio;
    const f2 = f > fin ? fin : f;
    return resumirDias(recortar(i2, f2), i2, f2);
  });
  const meses = mesesEnRango(desde, fin).map(({ mes, inicio, fin: f }) => {
    const i2 = inicio < desde ? desde : inicio;
    const f2 = f > fin ? fin : f;
    return { mes, ...resumirDias(recortar(i2, f2), i2, f2) };
  });

  const diasRegistrados = new Set(serie.filter((d) => d.registrado).map((d) => d.fecha));
  const promedioPorComida = {} as Record<ComidaId, Totales>;
  for (const { id } of COMIDAS) {
    const suma = sumarTotales(registros
      .filter((r) => r.comida === id && diasRegistrados.has(r.fecha))
      .map((r) => r.totales));
    promedioPorComida[id] = diasRegistrados.size ? escalarTotales(suma, 1 / diasRegistrados.size) : totalesCero();
  }
  const { actual, maxima } = rachas(serie);
  return {
    desde,
    hasta: fin,
    ...resumirDias(serie, desde, fin),
    serie,
    semanas,
    meses,
    promedioPorComida,
    rachaActual: actual,
    rachaMaxima: maxima,
  };
}

export interface ResumenDia {
  fecha: string;
  porComida: Record<ComidaId, { registros: RegistroComida[]; totales: Totales }>;
  totales: Totales;
  meta: Metas | null;
  /** meta − consumo por nutriente principal (negativo = excedido); null sin meta */
  restante: Pick<Totales, ClavePrincipal> | null;
  registrado: boolean;
}

/** Agrupa los registros de un día por comida (en el orden de COMIDAS) con totales y restante. */
export function resumirDia(fecha: string, registros: readonly RegistroComida[], meta: Metas | null): ResumenDia {
  const delDia = registros.filter((r) => r.fecha === fecha);
  const porComida = {} as ResumenDia['porComida'];
  for (const { id } of COMIDAS) {
    const lista = delDia.filter((r) => r.comida === id)
      .sort((a, b) => (a.creado < b.creado ? -1 : a.creado > b.creado ? 1 : 0));
    porComida[id] = { registros: lista, totales: sumarTotales(lista.map((r) => r.totales)) };
  }
  const totales = sumarTotales(delDia.map((r) => r.totales));
  return {
    fecha,
    porComida,
    totales,
    meta,
    restante: meta
      ? {
        kcal: limpiar(meta.kcal - totales.kcal),
        proteina: limpiar(meta.proteina - totales.proteina),
        carbohidratos: limpiar(meta.carbohidratos - totales.carbohidratos),
        grasa: limpiar(meta.grasa - totales.grasa),
      }
      : null,
    registrado: delDia.length > 0,
  };
}
