/**
 * Recetas: totales, valores por porción y conversión a `Alimento` para registrarlas.
 *
 * Peso de la receta (para expresar nutrientes por 100 g):
 *  - `pesoFinalG` si el usuario lo capturó (peso cocinado real)            → origen 'peso_final'
 *  - si no, y TODOS los ingredientes están en gramos (base g, o base ml con
 *    densidad conocida → g = ml × densidad): la suma                      → origen 'suma_gramos'
 *  - si se mezclan g y ml sin densidad y sin peso final: NO hay peso real. Se usa un peso
 *    NOMINAL = suma de las cantidades base (g y ml sumados tal cual) únicamente como
 *    denominador interno; el alimento resultante lleva `soloPorciones: true`, de modo que
 *    solo puede registrarse por "porción" y nunca por gramos                → origen 'nominal'
 * En los tres casos 1 porción = peso / porciones y los valores por porción son exactos.
 */
import type { Alimento, IngredienteReceta, Nutrientes, Receta, Totales, UnidadId } from '../tipos';
import {
  CLAVES_OPCIONALES, CLAVES_PRINCIPALES, calcularTotales, escalarTotales, limpiar, sumarTotales,
} from './calculo';
import type { ClavePrincipal } from './calculo';
import { instantaneaDe } from './instantanea';
import { convertirABase } from './unidades';

export interface TotalesReceta extends Totales {
  /** Ingredientes a los que les falta algún macro principal (el total es un mínimo). */
  incompletos: { nombre: string; faltantes: ClavePrincipal[] }[];
}

export interface PesoReceta {
  /** Peso usado como denominador de los valores por 100 g */
  pesoG: number;
  origen: 'peso_final' | 'suma_gramos' | 'nominal';
  /** false cuando el peso es nominal: la receta solo se registra por porciones */
  registrablePorGramos: boolean;
}

const positivo = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Ingrediente listo para guardar, o el motivo por el que la cantidad no es convertible. */
export function crearIngrediente(
  alimento: Alimento, cantidad: number, unidad: UnidadId, porcionEtiqueta?: string,
): { ok: true; ingrediente: IngredienteReceta } | { ok: false; motivo: string } {
  const r = convertirABase(alimento, cantidad, unidad, porcionEtiqueta);
  if (!r.ok) return r;
  const ingrediente: IngredienteReceta = {
    alimentoId: alimento.id,
    instantanea: instantaneaDe(alimento),
    cantidad,
    unidad,
    cantidadBase: r.cantidadBase,
  };
  if (porcionEtiqueta !== undefined) ingrediente.porcionEtiqueta = porcionEtiqueta;
  return { ok: true, ingrediente };
}

/** Totales de la receta completa (todas las porciones). */
export function totalesReceta(receta: Pick<Receta, 'ingredientes'>): TotalesReceta {
  const incompletos: TotalesReceta['incompletos'] = [];
  const partes = receta.ingredientes.map((ing) => {
    const { faltantes, ...t } = calcularTotales(ing.instantanea.nutrientes, ing.cantidadBase);
    if (faltantes.length) incompletos.push({ nombre: ing.instantanea.nombre, faltantes });
    return t;
  });
  return { ...sumarTotales(partes), incompletos };
}

/** Totales de UNA porción. */
export function totalesPorPorcion(receta: Pick<Receta, 'ingredientes' | 'porciones'>): Totales {
  if (!positivo(receta.porciones)) throw new RangeError('La receta debe tener al menos una porción.');
  const { incompletos: _omitido, ...t } = totalesReceta(receta);
  void _omitido;
  return escalarTotales(t, 1 / receta.porciones);
}

export function pesoReceta(receta: Pick<Receta, 'ingredientes' | 'pesoFinalG'>): PesoReceta {
  if (positivo(receta.pesoFinalG)) {
    return { pesoG: receta.pesoFinalG, origen: 'peso_final', registrablePorGramos: true };
  }
  let gramos = 0;
  let nominal = 0;
  let todoEnGramos = receta.ingredientes.length > 0;
  for (const ing of receta.ingredientes) {
    nominal += ing.cantidadBase;
    if (ing.instantanea.soloPorciones) {
      todoEnGramos = false; // sub-receta de peso nominal: su "g" no es real
    } else if (ing.instantanea.base === 'g') {
      gramos += ing.cantidadBase;
    } else if (positivo(ing.instantanea.densidad)) {
      gramos += ing.cantidadBase * ing.instantanea.densidad;
    } else {
      todoEnGramos = false;
    }
  }
  return todoEnGramos
    ? { pesoG: limpiar(gramos), origen: 'suma_gramos', registrablePorGramos: true }
    : { pesoG: limpiar(nominal), origen: 'nominal', registrablePorGramos: false };
}

/** Suma de micronutrientes de los ingredientes (solo los que alguno declara). */
function microsReceta(ingredientes: IngredienteReceta[]): Record<string, number> | undefined {
  const r: Record<string, number> = {};
  for (const ing of ingredientes) {
    for (const [k, v] of Object.entries(ing.instantanea.nutrientes.micros ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v)) r[k] = (r[k] ?? 0) + (v * ing.cantidadBase) / 100;
    }
  }
  return Object.keys(r).length ? r : undefined;
}

/**
 * Receta como alimento registrable (fuente 'receta', id `receta:<id>`, base 'g').
 * Siempre incluye la porción { unidad: 'porcion', etiqueta: '1 porción' } como predeterminada.
 * Ver el encabezado del archivo para el caso de peso nominal (`soloPorciones`).
 */
export function recetaComoAlimento(receta: Receta): Alimento {
  if (!positivo(receta.porciones)) throw new RangeError('La receta debe tener al menos una porción.');
  const { incompletos, ...totales } = totalesReceta(receta);
  const peso = pesoReceta(receta);
  if (!positivo(peso.pesoG)) throw new RangeError('La receta no tiene ingredientes con cantidad.');

  // Sin limpiar: es un valor intermedio; recortarlo a 6 decimales perdería precisión al multiplicar.
  const por100 = (v: number): number => (v * 100) / peso.pesoG;
  const nutrientes: Nutrientes = {};
  for (const c of CLAVES_PRINCIPALES) nutrientes[c] = por100(totales[c]);
  for (const c of CLAVES_OPCIONALES) if (totales[c] !== undefined) nutrientes[c] = por100(totales[c]!);
  const micros = microsReceta(receta.ingredientes);
  if (micros) {
    nutrientes.micros = Object.fromEntries(Object.entries(micros).map(([k, v]) => [k, por100(v)]));
  }

  const notas = [
    receta.notas,
    peso.origen === 'nominal'
      ? 'Mezcla ingredientes en gramos y mililitros sin peso final: solo se registra por porciones.'
      : undefined,
    incompletos.length
      ? `Datos incompletos en: ${incompletos.map((i) => i.nombre).join(', ')}. Los totales son un mínimo.`
      : undefined,
  ].filter(Boolean).join(' ');

  const alimento: Alimento = {
    id: `receta:${receta.id}`,
    fuente: 'receta',
    idOriginal: receta.id,
    nombre: receta.nombre,
    nombreOriginal: receta.nombre,
    idiomaOriginal: 'es',
    categoria: 'Recetas',
    base: 'g',
    nutrientes,
    porciones: [{
      etiqueta: '1 porción',
      unidad: 'porcion',
      equivalencia: limpiar(peso.pesoG / receta.porciones),
      predeterminada: true,
    }],
    actualizado: receta.modificado,
    validacion: 'usuario',
  };
  if (notas) alimento.notas = notas;
  if (!peso.registrablePorGramos) alimento.soloPorciones = true;
  return alimento;
}
