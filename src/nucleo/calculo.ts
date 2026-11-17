/**
 * Cálculo de totales nutricionales. Los nutrientes de un alimento van siempre por
 * 100 unidades de su base (100 g o 100 ml); `cantidadBase` es la cantidad ya convertida
 * con `convertirABase`.
 *
 * Datos faltantes: `undefined` ≠ 0. Los macros principales (kcal, proteína, carbohidratos,
 * grasa) faltantes cuentan 0 en el total pero se listan en `faltantes`; los opcionales
 * (grasa saturada, fibra, azúcares, sodio) quedan `undefined`.
 *
 * Precisión: los valores se guardan sin redondear a enteros; solo se limpian a 6 decimales
 * para que no afloren residuos binarios (0.1 + 0.2). El redondeo visible es cosa de `formatear`.
 */
import type { Nutrientes, Totales } from '../tipos';

export type ClavePrincipal = 'kcal' | 'proteina' | 'carbohidratos' | 'grasa';
export type ClaveOpcional = 'grasaSaturada' | 'fibra' | 'azucares' | 'sodio';

export const CLAVES_PRINCIPALES: ClavePrincipal[] = ['kcal', 'proteina', 'carbohidratos', 'grasa'];
export const CLAVES_OPCIONALES: ClaveOpcional[] = ['grasaSaturada', 'fibra', 'azucares', 'sodio'];

export const NOMBRE_NUTRIENTE: Record<ClavePrincipal | ClaveOpcional, { nombre: string; unidad: string }> = {
  kcal: { nombre: 'Calorías', unidad: 'kcal' },
  proteina: { nombre: 'Proteína', unidad: 'g' },
  carbohidratos: { nombre: 'Carbohidratos', unidad: 'g' },
  grasa: { nombre: 'Grasa', unidad: 'g' },
  grasaSaturada: { nombre: 'Grasa saturada', unidad: 'g' },
  fibra: { nombre: 'Fibra', unidad: 'g' },
  azucares: { nombre: 'Azúcares', unidad: 'g' },
  sodio: { nombre: 'Sodio', unidad: 'mg' },
};

/** Totales con la lista de macros principales que faltaban en la fuente (contados como 0). */
export interface TotalesCalculados extends Totales {
  faltantes: ClavePrincipal[];
}

const esNumero = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Limpia residuos de coma flotante (6 decimales). No es redondeo de presentación. */
export function limpiar(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Redondeo a `decimales` (mitad hacia arriba, estable frente a 1.005). */
export function redondear(n: number, decimales = 0): number {
  const f = 10 ** decimales;
  return Math.round(limpiar(n * f)) / f;
}

export function totalesCero(): Totales {
  return { kcal: 0, proteina: 0, carbohidratos: 0, grasa: 0 };
}

/** Macros principales que el alimento no trae (dato faltante, no cero). */
export function nutrientesFaltantes(nutrientes: Nutrientes): ClavePrincipal[] {
  return CLAVES_PRINCIPALES.filter((c) => !esNumero(nutrientes[c]));
}

export function calcularTotales(nutrientesPor100: Nutrientes, cantidadBase: number): TotalesCalculados {
  if (!esNumero(cantidadBase) || cantidadBase < 0) {
    throw new RangeError('La cantidad base debe ser un número finito mayor o igual a cero.');
  }
  const de = (v: number | undefined): number | undefined =>
    (esNumero(v) ? limpiar((v * cantidadBase) / 100) : undefined);
  const r: TotalesCalculados = {
    kcal: de(nutrientesPor100.kcal) ?? 0,
    proteina: de(nutrientesPor100.proteina) ?? 0,
    carbohidratos: de(nutrientesPor100.carbohidratos) ?? 0,
    grasa: de(nutrientesPor100.grasa) ?? 0,
    faltantes: nutrientesFaltantes(nutrientesPor100),
  };
  for (const c of CLAVES_OPCIONALES) {
    const v = de(nutrientesPor100[c]);
    if (v !== undefined) r[c] = v;
  }
  return r;
}

/** Quita `faltantes` (y cualquier clave ajena) para guardar un `Totales` limpio. */
export function soloTotales(t: Totales): Totales {
  const r = totalesCero();
  for (const c of CLAVES_PRINCIPALES) r[c] = t[c];
  for (const c of CLAVES_OPCIONALES) if (esNumero(t[c])) r[c] = t[c];
  return r;
}

/**
 * Suma de totales. Un opcional queda `undefined` solo si ningún sumando lo trae;
 * si lo traen algunos, se suman esos (total parcial).
 */
export function sumarTotales(lista: Iterable<Totales>): Totales {
  const r = totalesCero();
  for (const t of lista) {
    for (const c of CLAVES_PRINCIPALES) r[c] += esNumero(t[c]) ? t[c] : 0;
    for (const c of CLAVES_OPCIONALES) {
      const v = t[c];
      if (esNumero(v)) r[c] = (r[c] ?? 0) + v;
    }
  }
  for (const c of CLAVES_PRINCIPALES) r[c] = limpiar(r[c]);
  for (const c of CLAVES_OPCIONALES) if (r[c] !== undefined) r[c] = limpiar(r[c]!);
  return r;
}

/** Multiplica todos los valores (p. ej. dividir una receta entre sus porciones: factor 1/n). */
export function escalarTotales(t: Totales, factor: number): Totales {
  const r = totalesCero();
  for (const c of CLAVES_PRINCIPALES) r[c] = limpiar(t[c] * factor);
  for (const c of CLAVES_OPCIONALES) if (esNumero(t[c])) r[c] = limpiar(t[c]! * factor);
  return r;
}

/** Promedio de una lista de totales; `null` si está vacía. */
export function promediarTotales(lista: Totales[]): Totales | null {
  if (lista.length === 0) return null;
  return escalarTotales(sumarTotales(lista), 1 / lista.length);
}

/** Energía estimada con factores de Atwater 4/4/9. Para validar datos, no para registrar. */
export function kcalDesdeMacros(m: { proteina?: number; carbohidratos?: number; grasa?: number }): number {
  return limpiar(4 * (m.proteina ?? 0) + 4 * (m.carbohidratos ?? 0) + 9 * (m.grasa ?? 0));
}

export interface ValidacionEnergia {
  /** false si las kcal declaradas se alejan de 4/4/9 más que la tolerancia */
  coherente: boolean;
  kcalDeclaradas: number | undefined;
  kcalEstimadas: number;
  /** (declaradas − estimadas) / estimadas; undefined si no se puede calcular */
  diferenciaRelativa: number | undefined;
}

/**
 * Compara las kcal declaradas con 4/4/9. Tolerancia relativa (por defecto 20 %) con un
 * margen absoluto de 10 kcal: fibra, polialcoholes y alcohol hacen que no coincidan exacto.
 */
export function validarEnergia(n: Nutrientes, tolerancia = 0.2): ValidacionEnergia {
  const kcalEstimadas = kcalDesdeMacros(n);
  if (!esNumero(n.kcal) || nutrientesFaltantes(n).length > 0) {
    return { coherente: true, kcalDeclaradas: n.kcal, kcalEstimadas, diferenciaRelativa: undefined };
  }
  const dif = n.kcal - kcalEstimadas;
  return {
    coherente: Math.abs(dif) <= Math.max(10, tolerancia * kcalEstimadas),
    kcalDeclaradas: n.kcal,
    kcalEstimadas,
    diferenciaRelativa: kcalEstimadas > 0 ? limpiar(dif / kcalEstimadas) : undefined,
  };
}

/**
 * Redondeo SOLO para presentación, con formato es-MX (1,234.5).
 * `undefined`/`null`/no finito → "—" (dato faltante, no cero).
 */
export function formatear(valor: number | undefined | null, decimales = 0): string {
  if (!esNumero(valor)) return '—';
  const r = redondear(valor, decimales);
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0, maximumFractionDigits: decimales,
  }).format(Object.is(r, -0) ? 0 : r);
}

/** "134 kcal", "12.5 g", "320 mg" según el nutriente. */
export function formatearNutriente(clave: ClavePrincipal | ClaveOpcional, valor: number | undefined | null): string {
  const { unidad } = NOMBRE_NUTRIENTE[clave];
  if (!esNumero(valor)) return '—';
  const decimales = clave === 'kcal' || clave === 'sodio' ? 0 : 1;
  return `${formatear(valor, decimales)} ${unidad}`;
}
