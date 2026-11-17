import type { Alimento, Nutrientes } from '../../src/tipos.ts';

export interface ResultadoValidacion {
  ok: boolean;
  motivo?: string;
  atipico?: boolean;
}

/**
 * Reglas (por 100 g/ml):
 *  - descartar: sin nombre; sin kcal; kcal fuera de 0–950; macro <0 o >100 g; P+C+G > 105 g;
 *    sodio > 40 000 mg (más que la sal pura); saturada > grasa; azúcares > carbohidratos; fibra > carbohidratos+5.
 *  - atípico (se conserva y se marca): la energía no cuadra con 4/4/9 (+7 alcohol, fibra a 2 kcal) por más
 *    de max(30 %, 25 kcal).
 */
export function validar(a: Pick<Alimento, 'nombre' | 'nutrientes'>): ResultadoValidacion {
  if (!a.nombre || !a.nombre.trim()) return { ok: false, motivo: 'sin_nombre' };
  const n: Nutrientes = a.nutrientes;
  if (n.kcal === undefined || n.kcal === null || !Number.isFinite(n.kcal)) return { ok: false, motivo: 'sin_kcal' };
  if (n.kcal < 0 || n.kcal > 950) return { ok: false, motivo: 'kcal_imposible' };
  for (const k of ['proteina', 'carbohidratos', 'grasa', 'grasaSaturada', 'fibra', 'azucares'] as const) {
    const v = n[k];
    if (v !== undefined && (v < 0 || v > 100)) return { ok: false, motivo: 'macro_fuera_de_rango' };
  }
  const p = n.proteina ?? 0;
  const c = n.carbohidratos ?? 0;
  const g = n.grasa ?? 0;
  if (p + c + g > 105) return { ok: false, motivo: 'suma_macros_mayor_100' };
  if (n.sodio !== undefined && (n.sodio < 0 || n.sodio > 40000)) return { ok: false, motivo: 'sodio_imposible' };
  if (n.grasaSaturada !== undefined && n.grasa !== undefined && n.grasaSaturada > n.grasa * 1.05 + 0.5)
    return { ok: false, motivo: 'saturada_mayor_que_grasa' };
  if (n.azucares !== undefined && n.carbohidratos !== undefined && n.azucares > n.carbohidratos * 1.05 + 1)
    return { ok: false, motivo: 'azucares_mayor_que_carbohidratos' };
  if (n.fibra !== undefined && n.carbohidratos !== undefined && n.fibra > n.carbohidratos + 5 && n.carbohidratos > 0)
    return { ok: false, motivo: 'fibra_mayor_que_carbohidratos' };
  let atipico = false;
  if (n.proteina !== undefined && n.carbohidratos !== undefined && n.grasa !== undefined) {
    const alc = n.micros?.alcohol_g ?? 0;
    const f = Math.min(n.fibra ?? 0, n.carbohidratos);
    const estimada = 4 * p + 4 * (c - f) + 2 * f + 9 * g + 7 * alc;
    if (Math.abs(estimada - n.kcal) > Math.max(0.3 * n.kcal, 25)) atipico = true;
  }
  return { ok: true, atipico };
}
