/**
 * Análisis del peso corporal: promedios por semana (lunes–domingo) y mes, media móvil de
 * 7 días, tendencia suavizada, variación, distancia al objetivo y ritmo (kg/semana).
 *
 * Todas las funciones son puras y aceptan los registros en cualquier orden. Si hay más de
 * un registro en la misma fecha (no debería: la BD tiene fecha única) se promedian.
 * Los valores no se redondean: el redondeo es solo de presentación (`formatear`).
 */
import type { Perfil, RegistroPeso } from '../tipos';
import { limpiar } from './calculo';
import {
  claveMes, diasEntre, finMes, finSemana, inicioMes, inicioSemana, sumarDias,
} from './fechas';

export interface PuntoPeso { fecha: string; pesoKg: number }

export interface PromedioPeriodo {
  inicio: string;
  fin: string;
  /** promedio de los registros del periodo */
  promedioKg: number;
  minimoKg: number;
  maximoKg: number;
  registros: number;
}

export interface PromedioMes extends PromedioPeriodo {
  /** 'YYYY-MM' */
  mes: string;
}

export interface PuntoTendencia extends PuntoPeso {
  /** media de los registros de los últimos `ventanaDias` días (incluido el día) */
  mediaMovilKg: number;
  /** tendencia suavizada exponencialmente (descuenta el "ruido" de agua y comida) */
  tendenciaKg: number;
}

const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Un punto por fecha (promediando duplicados), ordenado por fecha ascendente. */
export function normalizarPesos(pesos: readonly Pick<RegistroPeso, 'fecha' | 'pesoKg'>[]): PuntoPeso[] {
  const porFecha = new Map<string, { suma: number; n: number }>();
  for (const p of pesos) {
    if (!finito(p.pesoKg) || p.pesoKg <= 0) continue;
    const a = porFecha.get(p.fecha) ?? { suma: 0, n: 0 };
    a.suma += p.pesoKg;
    a.n += 1;
    porFecha.set(p.fecha, a);
  }
  return [...porFecha.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([fecha, { suma, n }]) => ({ fecha, pesoKg: limpiar(suma / n) }));
}

function agrupar<K extends string>(
  puntos: PuntoPeso[], clave: (fecha: string) => K,
): Map<K, PuntoPeso[]> {
  const m = new Map<K, PuntoPeso[]>();
  for (const p of puntos) {
    const k = clave(p.fecha);
    const l = m.get(k);
    if (l) l.push(p);
    else m.set(k, [p]);
  }
  return m;
}

function resumir(lista: PuntoPeso[]): Omit<PromedioPeriodo, 'inicio' | 'fin'> {
  const valores = lista.map((p) => p.pesoKg);
  return {
    promedioKg: limpiar(valores.reduce((a, b) => a + b, 0) / valores.length),
    minimoKg: Math.min(...valores),
    maximoKg: Math.max(...valores),
    registros: valores.length,
  };
}

/** Promedio por semana lunes–domingo; solo semanas con al menos un registro. */
export function promediosSemanales(pesos: readonly Pick<RegistroPeso, 'fecha' | 'pesoKg'>[]): PromedioPeriodo[] {
  const grupos = agrupar(normalizarPesos(pesos), inicioSemana);
  return [...grupos.entries()].map(([inicio, lista]) => ({ inicio, fin: finSemana(inicio), ...resumir(lista) }));
}

/** Promedio por mes calendario; solo meses con al menos un registro. */
export function promediosMensuales(pesos: readonly Pick<RegistroPeso, 'fecha' | 'pesoKg'>[]): PromedioMes[] {
  const grupos = agrupar(normalizarPesos(pesos), claveMes);
  return [...grupos.entries()].map(([mes, lista]) => {
    const inicio = inicioMes(`${mes}-01`);
    return { mes, inicio, fin: finMes(inicio), ...resumir(lista) };
  });
}

export interface OpcionesTendencia {
  /** días de la media móvil (por defecto 7) */
  ventanaDias?: number;
  /** factor de suavizado por día, 0–1 (por defecto 0.1, como "The Hacker's Diet") */
  alfa?: number;
}

/**
 * Serie con media móvil y tendencia suavizada.
 * Media móvil: promedio de los registros con fecha en [día − (ventana − 1), día].
 * Tendencia: suavizado exponencial que respeta los huecos entre registros:
 *   T = T_prev + (1 − (1 − α)^díasTranscurridos) · (peso − T_prev), con T inicial = primer peso.
 */
export function serieTendencia(
  pesos: readonly Pick<RegistroPeso, 'fecha' | 'pesoKg'>[], opciones: OpcionesTendencia = {},
): PuntoTendencia[] {
  const ventana = Math.max(1, Math.floor(opciones.ventanaDias ?? 7));
  const alfa = Math.min(1, Math.max(0.0001, opciones.alfa ?? 0.1));
  const puntos = normalizarPesos(pesos);
  const r: PuntoTendencia[] = [];
  let tendencia = 0;
  let inicioVentana = 0;
  let sumaVentana = 0;
  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i];
    sumaVentana += p.pesoKg;
    const limite = sumarDias(p.fecha, -(ventana - 1));
    while (puntos[inicioVentana].fecha < limite) sumaVentana -= puntos[inicioVentana++].pesoKg;
    if (i === 0) tendencia = p.pesoKg;
    else {
      const dias = diasEntre(puntos[i - 1].fecha, p.fecha);
      tendencia += (1 - (1 - alfa) ** dias) * (p.pesoKg - tendencia);
    }
    r.push({
      ...p,
      mediaMovilKg: limpiar(sumaVentana / (i - inicioVentana + 1)),
      tendenciaKg: limpiar(tendencia),
    });
  }
  return r;
}

export interface Regresion { pendientePorDia: number; intercepto: number; puntos: number }

/** Mínimos cuadrados de y sobre x (x = días desde la primera fecha). `null` si no se puede. */
export function regresionLineal(serie: { fecha: string; valor: number }[]): Regresion | null {
  if (serie.length < 2) return null;
  const x0 = serie[0].fecha;
  const xs = serie.map((p) => diasEntre(x0, p.fecha));
  const ys = serie.map((p) => p.valor);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx === 0) return null;
  const pendientePorDia = sxy / sxx;
  return { pendientePorDia, intercepto: my - pendientePorDia * mx, puntos: n };
}

export interface OpcionesRitmo extends OpcionesTendencia {
  /** días hacia atrás desde el último registro que entran en la regresión (por defecto 28) */
  ventanaRitmoDias?: number;
  /** días mínimos cubiertos para dar un ritmo (por defecto 7) */
  minimoDias?: number;
}

/**
 * Ritmo en kg/semana (negativo = bajando) por regresión lineal sobre la TENDENCIA suavizada
 * de los últimos `ventanaRitmoDias` días. `null` si hay menos de 2 registros o cubren menos
 * de `minimoDias` días.
 */
export function ritmoKgSemana(
  pesos: readonly Pick<RegistroPeso, 'fecha' | 'pesoKg'>[], opciones: OpcionesRitmo = {},
): number | null {
  const serie = serieTendencia(pesos, opciones);
  if (serie.length < 2) return null;
  const ultimo = serie[serie.length - 1].fecha;
  const desde = sumarDias(ultimo, -(opciones.ventanaRitmoDias ?? 28));
  const tramo = serie.filter((p) => p.fecha >= desde);
  if (tramo.length < 2 || diasEntre(tramo[0].fecha, ultimo) < (opciones.minimoDias ?? 7)) return null;
  const reg = regresionLineal(tramo.map((p) => ({ fecha: p.fecha, valor: p.tendenciaKg })));
  return reg ? limpiar(reg.pendientePorDia * 7) : null;
}

export interface ResumenPeso {
  /** último registro */
  actual: PuntoPeso | null;
  /** primer registro o `perfil.pesoInicialKg` si se capturó */
  inicialKg: number | null;
  /** actual − inicial (negativo = bajó) */
  variacionKg: number | null;
  objetivoKg: number | null;
  /** objetivo − actual (negativo = falta bajar) */
  distanciaObjetivoKg: number | null;
  /** true si ya se alcanzó (según la dirección inicial → objetivo) */
  objetivoAlcanzado: boolean | null;
  /** fracción 0–1 del camino recorrido de inicial a objetivo */
  progreso: number | null;
  tendenciaKg: number | null;
  ritmoKgSemana: number | null;
  /** semanas estimadas al objetivo con el ritmo actual; null si el ritmo no va hacia el objetivo */
  semanasEstimadas: number | null;
  /** fecha estimada (local) en que se alcanzaría el objetivo */
  fechaEstimada: string | null;
  avisos: string[];
}

/** Variación respecto del peso inicial. */
export function variacionPeso(actualKg: number, inicialKg: number): number {
  return limpiar(actualKg - inicialKg);
}

/** Distancia al objetivo (objetivo − actual): negativa si falta bajar, positiva si falta subir. */
export function distanciaObjetivo(actualKg: number, objetivoKg: number): number {
  return limpiar(objetivoKg - actualKg);
}

/** Resumen completo para la pantalla de peso. */
export function resumenPeso(
  pesos: readonly Pick<RegistroPeso, 'fecha' | 'pesoKg'>[],
  perfil: Pick<Perfil, 'pesoInicialKg' | 'pesoObjetivoKg'> = {},
  opciones: OpcionesRitmo = {},
): ResumenPeso {
  const serie = serieTendencia(pesos, opciones);
  const avisos: string[] = [];
  const ultimo = serie[serie.length - 1];
  const actual = ultimo ? { fecha: ultimo.fecha, pesoKg: ultimo.pesoKg } : null;
  const inicialKg = finito(perfil.pesoInicialKg) ? perfil.pesoInicialKg : (serie[0]?.pesoKg ?? null);
  const objetivoKg = finito(perfil.pesoObjetivoKg) ? perfil.pesoObjetivoKg : null;
  const ritmo = ritmoKgSemana(pesos, opciones);

  let distancia: number | null = null;
  let alcanzado: boolean | null = null;
  let progreso: number | null = null;
  let semanas: number | null = null;
  let fechaEstimada: string | null = null;
  if (actual && objetivoKg !== null) {
    distancia = distanciaObjetivo(actual.pesoKg, objetivoKg);
    const direccion = inicialKg !== null ? Math.sign(objetivoKg - inicialKg) : Math.sign(distancia);
    alcanzado = direccion === 0 ? distancia === 0 : direccion * distancia <= 0;
    if (inicialKg !== null && objetivoKg !== inicialKg) {
      progreso = limpiar(Math.min(1, Math.max(0, (actual.pesoKg - inicialKg) / (objetivoKg - inicialKg))));
    }
    if (!alcanzado && ritmo !== null && ritmo !== 0 && Math.sign(ritmo) === Math.sign(distancia)) {
      semanas = limpiar(distancia / ritmo);
      fechaEstimada = sumarDias(actual.fecha, Math.ceil(limpiar((distancia / ritmo) * 7)));
    }
  }
  if (ritmo !== null && ritmo < -1) {
    avisos.push('Estás bajando más de 1 kg por semana. Un ritmo tan rápido puede implicar pérdida de músculo; '
      + 'considera consultarlo con un profesional.');
  }
  if (serie.length > 0 && serie.length < 3) {
    avisos.push('Con pocos registros la tendencia todavía no es confiable; pésate con regularidad, a la misma hora.');
  }

  return {
    actual,
    inicialKg,
    variacionKg: actual && inicialKg !== null ? variacionPeso(actual.pesoKg, inicialKg) : null,
    objetivoKg,
    distanciaObjetivoKg: distancia,
    objetivoAlcanzado: alcanzado,
    progreso,
    tendenciaKg: ultimo ? ultimo.tendenciaKg : null,
    ritmoKgSemana: ritmo,
    semanasEstimadas: semanas,
    fechaEstimada,
    avisos,
  };
}

/** Índice de masa corporal (kg/m²). Orientativo. */
export function imc(pesoKg: number, estaturaCm: number): number | null {
  if (!finito(pesoKg) || !finito(estaturaCm) || pesoKg <= 0 || estaturaCm <= 0) return null;
  return limpiar(pesoKg / (estaturaCm / 100) ** 2);
}
