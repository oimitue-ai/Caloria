/**
 * Gasto energético y propuesta de metas. TODO es orientativo y editable por el usuario:
 * son estimaciones poblacionales, no una prescripción médica ni nutricional.
 */
import type { Metas, NivelActividad, Objetivo, Perfil, Sexo } from '../tipos';
import { limpiar } from './calculo';

export const AVISO_ORIENTATIVO =
  'Estos valores son una estimación orientativa calculada con fórmulas generales (Mifflin-St Jeor). '
  + 'No son una prescripción médica ni sustituyen la valoración de un profesional de la salud. '
  + 'Puedes ajustar cualquier meta manualmente.';

export const AVISO_CONSULTA =
  'Si estás embarazada o en lactancia, eres menor de 18 años, tienes una enfermedad crónica o un '
  + 'historial de trastornos de la conducta alimentaria, consulta a un profesional antes de seguir una meta calórica.';

export const FACTORES_ACTIVIDAD: Record<NivelActividad, number> = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  activo: 1.725,
  muy_activo: 1.9,
};

export const NIVELES_ACTIVIDAD: { id: NivelActividad; nombre: string; descripcion: string; factor: number }[] = [
  { id: 'sedentario', nombre: 'Sedentario', descripcion: 'Poco o ningún ejercicio, trabajo de escritorio', factor: 1.2 },
  { id: 'ligero', nombre: 'Ligero', descripcion: 'Ejercicio ligero 1 a 3 días por semana', factor: 1.375 },
  { id: 'moderado', nombre: 'Moderado', descripcion: 'Ejercicio moderado 3 a 5 días por semana', factor: 1.55 },
  { id: 'activo', nombre: 'Activo', descripcion: 'Ejercicio intenso 6 a 7 días por semana', factor: 1.725 },
  { id: 'muy_activo', nombre: 'Muy activo', descripcion: 'Ejercicio muy intenso o trabajo físico pesado', factor: 1.9 },
];

/** Energía aproximada de 1 kg de peso corporal. */
export const KCAL_POR_KG = 7700;
export const RITMO_PREDETERMINADO: Record<Objetivo, number> = { perder: 0.5, mantener: 0, ganar: 0.25 };
export const RITMO_MAXIMO: Record<Objetivo, number> = { perder: 1, mantener: 0, ganar: 0.5 };
export const PISO_KCAL: Record<Sexo, number> = { mujer: 1200, hombre: 1500 };
export const PROTEINA_G_KG = { minimo: 1.6, maximo: 2.0, predeterminado: 1.8 };
export const GRASA_FRACCION = { minimo: 0.25, maximo: 0.30, predeterminado: 0.275 };

export interface DatosCorporales { sexo: Sexo; pesoKg: number; estaturaCm: number; edad: number }

/** Tasa metabólica basal (kcal/día), Mifflin-St Jeor: 10·kg + 6.25·cm − 5·edad + 5 (hombre) / −161 (mujer). */
export function tmbMifflinStJeor({ sexo, pesoKg, estaturaCm, edad }: DatosCorporales): number {
  return limpiar(10 * pesoKg + 6.25 * estaturaCm - 5 * edad + (sexo === 'hombre' ? 5 : -161));
}

/** Gasto energético total (kcal/día) = TMB × factor de actividad. */
export function gastoEnergeticoTotal(tmb: number, actividad: NivelActividad): number {
  return limpiar(tmb * FACTORES_ACTIVIDAD[actividad]);
}

export interface OpcionesMacros {
  /** g de proteína por kg de peso (1.6–2.0; por defecto 1.8) */
  proteinaGKg?: number;
  /** fracción de las kcal que aporta la grasa (0.25–0.30; por defecto 0.275) */
  grasaFraccion?: number;
}

export interface RepartoMacros {
  proteina: number;
  carbohidratos: number;
  grasa: number;
  avisos: string[];
}

/**
 * Reparto propuesto en gramos enteros: proteína por kg de peso, grasa como fracción de las
 * kcal y el resto en carbohidratos (4/4/9).
 */
export function repartirMacros(kcal: number, pesoKg: number, opciones: OpcionesMacros = {}): RepartoMacros {
  const avisos: string[] = [];
  const pKg = opciones.proteinaGKg ?? PROTEINA_G_KG.predeterminado;
  const gFr = opciones.grasaFraccion ?? GRASA_FRACCION.predeterminado;
  let proteina = Math.round(pKg * pesoKg);
  const grasa = Math.round((kcal * gFr) / 9);
  let restante = kcal - proteina * 4 - grasa * 9;
  if (restante < 0) {
    // Con muy pocas kcal la proteína por kg no cabe: se reduce para no exceder la energía.
    proteina = Math.max(0, Math.floor((kcal - grasa * 9) / 4));
    restante = kcal - proteina * 4 - grasa * 9;
    avisos.push('Con esta meta calórica no cabe la proteína recomendada por kilogramo; se redujo para no exceder las calorías.');
  }
  return { proteina, grasa, carbohidratos: Math.max(0, Math.round(restante / 4)), avisos };
}

export interface OpcionesPropuesta extends OpcionesMacros {
  /** Sustituye el piso de seguridad (no recomendado). */
  pisoKcal?: number;
}

export interface PropuestaMetas {
  ok: true;
  tmb: number;
  /** Gasto energético total estimado (mantenimiento) */
  get: number;
  factorActividad: number;
  objetivo: Objetivo;
  /** kg/semana efectivamente usados (positivo) */
  ritmoKgSemana: number;
  /** kcal/día sumadas (ganar) o restadas (perder, negativo) al GET antes del piso */
  ajusteDiarioKcal: number;
  /** true si la meta se elevó al piso de seguridad */
  pisoAplicado: boolean;
  /** Meta propuesta, sin `desde` (lo pone quien la guarda) */
  metas: Omit<Metas, 'desde'>;
  /** Avisos específicos de esta propuesta + AVISO_ORIENTATIVO (siempre el último) */
  avisos: string[];
}

export type ResultadoPropuesta = PropuestaMetas | { ok: false; faltantes: string[]; mensaje: string };

const CAMPOS: { clave: keyof Perfil; nombre: string }[] = [
  { clave: 'sexo', nombre: 'sexo' },
  { clave: 'edad', nombre: 'edad' },
  { clave: 'estaturaCm', nombre: 'estatura' },
  { clave: 'pesoActualKg', nombre: 'peso actual' },
  { clave: 'actividad', nombre: 'nivel de actividad' },
];

/**
 * Propone kcal y macros a partir del perfil. Requiere sexo, edad, estatura, peso actual y
 * actividad; `objetivo` por defecto 'mantener'. No guarda nada: el usuario puede editarla.
 */
export function proponerMetas(perfil: Perfil, opciones: OpcionesPropuesta = {}): ResultadoPropuesta {
  const faltantes = CAMPOS.filter((c) => perfil[c.clave] === undefined || perfil[c.clave] === null)
    .map((c) => c.nombre);
  if (faltantes.length) {
    return { ok: false, faltantes, mensaje: `Para calcular una propuesta falta: ${faltantes.join(', ')}.` };
  }
  const sexo = perfil.sexo!;
  const pesoKg = perfil.pesoActualKg!;
  const objetivo = perfil.objetivo ?? 'mantener';
  const avisos: string[] = [];

  const tmb = tmbMifflinStJeor({ sexo, pesoKg, estaturaCm: perfil.estaturaCm!, edad: perfil.edad! });
  const get = gastoEnergeticoTotal(tmb, perfil.actividad!);

  let ritmo = objetivo === 'mantener' ? 0 : (perfil.ritmoKgSemana ?? RITMO_PREDETERMINADO[objetivo]);
  if (!Number.isFinite(ritmo) || ritmo < 0) ritmo = RITMO_PREDETERMINADO[objetivo];
  if (ritmo > RITMO_MAXIMO[objetivo]) {
    avisos.push(`El ritmo solicitado (${ritmo} kg por semana) es mayor al máximo recomendado; `
      + `se usó ${RITMO_MAXIMO[objetivo]} kg por semana.`);
    ritmo = RITMO_MAXIMO[objetivo];
  }
  const signo = objetivo === 'perder' ? -1 : objetivo === 'ganar' ? 1 : 0;
  const ajusteDiarioKcal = limpiar((signo * ritmo * KCAL_POR_KG) / 7);

  let kcal = Math.round(get + ajusteDiarioKcal);
  const piso = opciones.pisoKcal ?? PISO_KCAL[sexo];
  const pisoAplicado = kcal < piso;
  if (pisoAplicado) {
    avisos.push(`La meta calculada (${kcal} kcal) queda por debajo del mínimo de seguridad de ${piso} kcal `
      + `para ${sexo === 'mujer' ? 'mujeres' : 'hombres'}; se ajustó a ${piso} kcal. `
      + 'Bajar de ese nivel solo debe hacerse con supervisión profesional.');
    kcal = piso;
  }
  if (perfil.edad! < 18) {
    avisos.push('La fórmula está validada para personas adultas; en menores de 18 años la estimación no es confiable.');
  }
  if (perfil.pesoObjetivoKg !== undefined) {
    if (objetivo === 'perder' && perfil.pesoObjetivoKg >= pesoKg) {
      avisos.push('Tu peso objetivo no es menor que tu peso actual, pero el objetivo elegido es perder peso.');
    }
    if (objetivo === 'ganar' && perfil.pesoObjetivoKg <= pesoKg) {
      avisos.push('Tu peso objetivo no es mayor que tu peso actual, pero el objetivo elegido es ganar peso.');
    }
  }

  const macros = repartirMacros(kcal, pesoKg, opciones);
  avisos.push(...macros.avisos, AVISO_ORIENTATIVO);

  return {
    ok: true,
    tmb,
    get,
    factorActividad: FACTORES_ACTIVIDAD[perfil.actividad!],
    objetivo,
    ritmoKgSemana: ritmo,
    ajusteDiarioKcal,
    pisoAplicado,
    metas: { kcal, proteina: macros.proteina, carbohidratos: macros.carbohidratos, grasa: macros.grasa },
    avisos,
  };
}

/** Meta vigente en una fecha: la de `desde` más reciente que no sea posterior. `null` si no hay. */
export function metaVigenteEn(historial: Metas[], fecha: string): Metas | null {
  let mejor: Metas | null = null;
  for (const m of historial) {
    if (m.desde <= fecha && (mejor === null || m.desde > mejor.desde)) mejor = m;
  }
  return mejor;
}

/** Avisos (no bloqueantes) sobre una meta editada a mano. */
export function revisarMetas(metas: Pick<Metas, 'kcal' | 'proteina' | 'carbohidratos' | 'grasa'>, sexo?: Sexo): string[] {
  const avisos: string[] = [];
  const deMacros = 4 * metas.proteina + 4 * metas.carbohidratos + 9 * metas.grasa;
  if (metas.kcal > 0 && Math.abs(deMacros - metas.kcal) > Math.max(50, metas.kcal * 0.05)) {
    avisos.push(`Los macros suman ${Math.round(deMacros)} kcal, pero la meta es de ${Math.round(metas.kcal)} kcal.`);
  }
  const piso = sexo ? PISO_KCAL[sexo] : PISO_KCAL.mujer;
  if (metas.kcal < piso) {
    avisos.push(`Una meta menor a ${piso} kcal diarias solo debe seguirse con supervisión profesional.`);
  }
  return avisos;
}
