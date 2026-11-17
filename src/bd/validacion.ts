/**
 * Esquemas zod de todas las entidades guardadas. Se usan al escribir en la BD y al importar
 * respaldos. Los mensajes van en español.
 */
import { z } from 'zod';
import type {
  Alimento, Configuracion, IngredienteReceta, Metas, Nutrientes, Perfil, Porcion, Receta, RegistroComida,
  RegistroPeso, Totales,
} from '../tipos';
import { esFechaValida } from '../nucleo/fechas';
import type { AlimentoEnCache, Favorito, Instantanea, UsoAlimento } from './tipos';
import { ErrorDatos } from './tipos';

export const UNIDADES = ['g', 'kg', 'ml', 'l', 'pieza', 'taza', 'cucharada', 'cucharadita', 'porcion'] as const;
export const FUENTES = ['usda_foundation', 'usda_sr_legacy', 'usda_fndds', 'usda_branded', 'off', 'mx_conabio',
  'mx_bam', 'caloria_recetas', 'usuario', 'receta'] as const;
export const VALIDACIONES = ['oficial', 'etiqueta', 'comunidad', 'receta_estandar', 'usuario'] as const;
export const COMIDA_IDS = ['desayuno', 'colacion1', 'almuerzo', 'comida', 'cena', 'colacion2'] as const;

const numero = z.number({ error: 'Debe ser un número.' }).refine(Number.isFinite, 'Debe ser un número finito.');
const noNegativo = numero.refine((n) => n >= 0, 'No puede ser negativo.');
const positivo = numero.refine((n) => n > 0, 'Debe ser mayor que cero.');
const texto = z.string().trim().min(1, 'No puede estar vacío.');
export const esquemaFecha = z.string().refine(esFechaValida, 'Fecha inválida (se espera AAAA-MM-DD).');
const marcaTiempo = z.string().min(1);

export const esquemaNutrientes: z.ZodType<Nutrientes> = z.object({
  kcal: noNegativo.optional(),
  proteina: noNegativo.optional(),
  carbohidratos: noNegativo.optional(),
  grasa: noNegativo.optional(),
  grasaSaturada: noNegativo.optional(),
  fibra: noNegativo.optional(),
  azucares: noNegativo.optional(),
  sodio: noNegativo.optional(),
  micros: z.record(z.string(), noNegativo).optional(),
});

export const esquemaPorcion: z.ZodType<Porcion> = z.object({
  etiqueta: texto,
  unidad: z.enum(UNIDADES),
  equivalencia: positivo,
  predeterminada: z.boolean().optional(),
});

export const esquemaAlimento: z.ZodType<Alimento> = z.object({
  id: texto,
  fuente: z.enum(FUENTES),
  idOriginal: z.string(),
  nombre: texto,
  nombreOriginal: z.string(),
  idiomaOriginal: z.string(),
  nombreTraducido: z.boolean().optional(),
  sinonimos: z.array(z.string()).optional(),
  categoria: z.string().optional(),
  marca: z.string().optional(),
  codigoBarras: z.string().optional(),
  base: z.enum(['g', 'ml']),
  nutrientes: esquemaNutrientes,
  densidad: positivo.optional(),
  porciones: z.array(esquemaPorcion),
  actualizado: z.string().optional(),
  validacion: z.enum(VALIDACIONES),
  mexicano: z.boolean().optional(),
  notas: z.string().optional(),
  equivalentes: z.array(z.string()).optional(),
  soloPorciones: z.boolean().optional(),
});

export const esquemaInstantanea: z.ZodType<Instantanea> = z.object({
  nombre: texto,
  marca: z.string().optional(),
  fuente: z.enum(FUENTES),
  base: z.enum(['g', 'ml']),
  nutrientes: esquemaNutrientes,
  densidad: positivo.optional(),
  porciones: z.array(esquemaPorcion),
  soloPorciones: z.boolean().optional(),
});

export const esquemaTotales: z.ZodType<Totales> = z.object({
  kcal: noNegativo,
  proteina: noNegativo,
  carbohidratos: noNegativo,
  grasa: noNegativo,
  grasaSaturada: noNegativo.optional(),
  fibra: noNegativo.optional(),
  azucares: noNegativo.optional(),
  sodio: noNegativo.optional(),
});

export const esquemaRegistro: z.ZodType<RegistroComida> = z.object({
  id: texto,
  fecha: esquemaFecha,
  comida: z.enum(COMIDA_IDS),
  alimentoId: texto,
  instantanea: esquemaInstantanea,
  cantidad: positivo,
  unidad: z.enum(UNIDADES),
  porcionEtiqueta: z.string().optional(),
  cantidadBase: noNegativo,
  totales: esquemaTotales,
  creado: marcaTiempo,
  modificado: marcaTiempo,
});

export const esquemaIngrediente: z.ZodType<IngredienteReceta> = z.object({
  alimentoId: texto,
  instantanea: esquemaInstantanea,
  cantidad: positivo,
  unidad: z.enum(UNIDADES),
  porcionEtiqueta: z.string().optional(),
  cantidadBase: positivo,
});

export const esquemaReceta: z.ZodType<Receta> = z.object({
  id: texto,
  nombre: texto,
  ingredientes: z.array(esquemaIngrediente).min(1, 'La receta necesita al menos un ingrediente.'),
  porciones: positivo,
  pesoFinalG: positivo.optional(),
  notas: z.string().optional(),
  creado: marcaTiempo,
  modificado: marcaTiempo,
});

export const esquemaPerfil: z.ZodType<Perfil> = z.object({
  nombre: z.string().optional(),
  edad: numero.refine((n) => n >= 1 && n <= 120, 'Edad fuera de rango (1–120).').optional(),
  sexo: z.enum(['hombre', 'mujer']).optional(),
  estaturaCm: numero.refine((n) => n >= 50 && n <= 250, 'Estatura fuera de rango (50–250 cm).').optional(),
  pesoActualKg: numero.refine((n) => n >= 20 && n <= 400, 'Peso fuera de rango (20–400 kg).').optional(),
  pesoInicialKg: numero.refine((n) => n >= 20 && n <= 400, 'Peso fuera de rango (20–400 kg).').optional(),
  pesoObjetivoKg: numero.refine((n) => n >= 20 && n <= 400, 'Peso fuera de rango (20–400 kg).').optional(),
  actividad: z.enum(['sedentario', 'ligero', 'moderado', 'activo', 'muy_activo']).optional(),
  objetivo: z.enum(['perder', 'mantener', 'ganar']).optional(),
  ritmoKgSemana: noNegativo.optional(),
});

export const esquemaMetas: z.ZodType<Metas> = z.object({
  kcal: positivo,
  proteina: noNegativo,
  carbohidratos: noNegativo,
  grasa: noNegativo,
  personalizada: z.boolean().optional(),
  desde: esquemaFecha,
});

export const esquemaPeso: z.ZodType<RegistroPeso> = z.object({
  id: texto,
  fecha: esquemaFecha,
  pesoKg: numero.refine((n) => n >= 20 && n <= 400, 'Peso fuera de rango (20–400 kg).'),
  nota: z.string().optional(),
});

export const esquemaConfig: z.ZodType<Configuracion> = z.object({
  tema: z.enum(['claro', 'oscuro', 'sistema']),
  ultimoRespaldo: z.string().optional(),
  recordarRespaldoDias: numero.refine((n) => n >= 0, 'No puede ser negativo.').optional(),
});

export const esquemaUso: z.ZodType<UsoAlimento> = z.object({
  alimentoId: texto,
  comida: z.enum(COMIDA_IDS),
  nombre: z.string(),
  marca: z.string().optional(),
  instantanea: esquemaInstantanea,
  cantidad: positivo,
  unidad: z.enum(UNIDADES),
  porcionEtiqueta: z.string().optional(),
  usos: noNegativo,
  ultimoUso: marcaTiempo,
});

export const esquemaFavorito: z.ZodType<Favorito> = z.object({
  alimentoId: texto,
  nombre: z.string(),
  marca: z.string().optional(),
  instantanea: esquemaInstantanea,
  creado: marcaTiempo,
});

export const esquemaCache: z.ZodType<AlimentoEnCache> = z.object({
  id: texto,
  alimento: esquemaAlimento,
  ultimoUso: marcaTiempo,
});

/** Mensaje legible de un error de zod: "campo.sub: mensaje; …" (máx. 5). */
export function describirErrores(error: z.ZodError): string {
  return error.issues.slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}

/** Valida y devuelve el dato limpio (sin claves desconocidas) o lanza `ErrorDatos`. */
export function validar<T>(esquema: z.ZodType<T>, dato: unknown, que: string): T {
  const r = esquema.safeParse(dato);
  if (!r.success) {
    const campo = r.error.issues[0]?.path.join('.') || undefined;
    throw new ErrorDatos(`${que} no válido: ${describirErrores(r.error)}`, campo);
  }
  return r.data;
}
