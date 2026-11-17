import { formatear } from '../nucleo';
import type { ComidaId, EstadoValidacion, FuenteId } from '../tipos';
import { COMIDAS } from '../tipos';

/** Une clases condicionales. */
export function cx(...clases: (string | false | null | undefined)[]): string {
  return clases.filter(Boolean).join(' ');
}

export const kcal = (n: number | undefined | null): string => formatear(n, 0);
export const gramos = (n: number | undefined | null): string => formatear(n, n !== undefined && n !== null && Math.abs(n) < 10 ? 1 : 0);

export function nombreComida(id: ComidaId): string {
  return COMIDAS.find((c) => c.id === id)?.nombre ?? id;
}

/** Comida sugerida según la hora local (para el botón flotante). */
export function comidaPorHora(fecha = new Date()): ComidaId {
  const h = fecha.getHours() + fecha.getMinutes() / 60;
  if (h < 10.5) return 'desayuno';
  if (h < 12) return 'colacion1';
  if (h < 13.5) return 'almuerzo';
  if (h < 17) return 'comida';
  if (h < 19) return 'colacion2';
  return 'cena';
}

export const NOMBRE_FUENTE: Record<FuenteId, string> = {
  usda_foundation: 'USDA Foundation',
  usda_sr_legacy: 'USDA SR Legacy',
  usda_fndds: 'USDA FNDDS',
  usda_branded: 'USDA Marcas',
  off: 'Open Food Facts',
  mx_conabio: 'Tabla mexicana',
  mx_bam: 'BAM México',
  caloria_recetas: 'Platillo CALORÍA',
  usuario: 'Mi alimento',
  receta: 'Mi receta',
};

export const VALIDACION: Record<EstadoValidacion, { texto: string; descripcion: string; tono: 'oficial' | 'etiqueta' | 'comunidad' | 'propio' }> = {
  oficial: { texto: 'Oficial', descripcion: 'Tabla de composición oficial o análisis de laboratorio', tono: 'oficial' },
  etiqueta: { texto: 'Etiqueta', descripcion: 'Declarado por el fabricante en la etiqueta', tono: 'etiqueta' },
  comunidad: { texto: 'Comunidad', descripcion: 'Aportado por usuarios de Open Food Facts; puede tener errores', tono: 'comunidad' },
  receta_estandar: { texto: 'Receta estándar', descripcion: 'Calculado a partir de ingredientes de tablas oficiales', tono: 'oficial' },
  usuario: { texto: 'Tuyo', descripcion: 'Creado por ti', tono: 'propio' },
};

/** Lee un número de un campo de texto aceptando coma decimal. */
export function leerNumero(texto: string): number | undefined {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return undefined;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : undefined;
}

export function vibrar(ms = 12): void {
  try { navigator.vibrate?.(ms); } catch { /* sin soporte */ }
}

export function idUnico(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
