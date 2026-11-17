import type { Nutrientes } from '../../src/tipos.ts';
import { r } from './util.ts';

/**
 * Nutrientes USDA (id de FoodData Central) → clave del contrato. Varias ids por clave = alternativas
 * en orden de preferencia (p. ej. Foundation reporta energía como Atwater específico/general).
 */
export const MAPA_USDA: { clave: string; ids: number[]; factor?: number[]; micro?: boolean }[] = [
  { clave: 'kcal', ids: [1008, 2048, 2047, 1062], factor: [1, 1, 1, 1 / 4.184] },
  { clave: 'proteina', ids: [1003] },
  { clave: 'carbohidratos', ids: [1005, 1050] },
  { clave: 'grasa', ids: [1004, 1085] },
  { clave: 'grasaSaturada', ids: [1258] },
  { clave: 'fibra', ids: [1079] },
  { clave: 'azucares', ids: [2000, 1063] },
  { clave: 'sodio', ids: [1093] },
  { clave: 'grasa_trans_g', ids: [1257], micro: true },
  { clave: 'grasa_monoinsaturada_g', ids: [1292], micro: true },
  { clave: 'grasa_poliinsaturada_g', ids: [1293], micro: true },
  { clave: 'colesterol_mg', ids: [1253], micro: true },
  { clave: 'agua_g', ids: [1051], micro: true },
  { clave: 'alcohol_g', ids: [1018], micro: true },
  { clave: 'cafeina_mg', ids: [1057], micro: true },
  { clave: 'calcio_mg', ids: [1087], micro: true },
  { clave: 'hierro_mg', ids: [1089], micro: true },
  { clave: 'magnesio_mg', ids: [1090], micro: true },
  { clave: 'fosforo_mg', ids: [1091], micro: true },
  { clave: 'potasio_mg', ids: [1092], micro: true },
  { clave: 'zinc_mg', ids: [1095], micro: true },
  { clave: 'vitamina_a_ug', ids: [1106], micro: true },
  { clave: 'vitamina_c_mg', ids: [1162], micro: true },
  { clave: 'vitamina_d_ug', ids: [1114], micro: true },
  { clave: 'vitamina_e_mg', ids: [1109], micro: true },
  { clave: 'vitamina_k_ug', ids: [1185], micro: true },
  { clave: 'tiamina_mg', ids: [1165], micro: true },
  { clave: 'riboflavina_mg', ids: [1166], micro: true },
  { clave: 'niacina_mg', ids: [1167], micro: true },
  { clave: 'vitamina_b6_mg', ids: [1175], micro: true },
  { clave: 'folato_ug', ids: [1177, 1190], micro: true },
  { clave: 'vitamina_b12_ug', ids: [1178], micro: true },
];

export const IDS_USDA_USADOS = new Set(MAPA_USDA.flatMap((m) => m.ids));

/** Construye Nutrientes desde un mapa id→cantidad (por 100 g/ml). Faltante queda undefined. */
export function nutrientesDesdeUsda(valores: Map<number, number>): Nutrientes {
  const n: Nutrientes = {};
  const micros: Record<string, number> = {};
  for (const m of MAPA_USDA) {
    let v: number | undefined;
    for (let i = 0; i < m.ids.length; i++) {
      const x = valores.get(m.ids[i]);
      if (x !== undefined && Number.isFinite(x)) {
        v = x * (m.factor?.[i] ?? 1);
        break;
      }
    }
    if (v === undefined) continue;
    // USDA: carbohidratos "por diferencia" ligeramente negativos en algunas carnes (artefacto de redondeo)
    if (v < 0 && v >= -1) v = 0;
    const red = r(v, m.clave === 'kcal' || m.clave === 'sodio' ? 1 : 2)!;
    if (m.micro) micros[m.clave] = red;
    else (n as Record<string, number>)[m.clave] = red;
  }
  if (Object.keys(micros).length) n.micros = micros;
  return n;
}

/** Columnas del espejo CodeJetNet (`n<id>`) → mapa id→valor. */
export function valoresDesdeColumnas(fila: Record<string, unknown>): Map<number, number> {
  const m = new Map<number, number>();
  for (const k in fila) {
    if (k[0] === 'n' && /^n\d+$/.test(k)) {
      const v = fila[k];
      if (typeof v === 'number' && Number.isFinite(v)) m.set(Number(k.slice(1)), v);
    }
  }
  return m;
}

/** Open Food Facts (volcado TSV, columnas *_100g). */
export const MAPA_OFF: { clave: string; col: string; factor?: number; micro?: boolean }[] = [
  { clave: 'kcal', col: 'energy-kcal_100g' },
  { clave: 'proteina', col: 'proteins_100g' },
  { clave: 'carbohidratos', col: 'carbohydrates_100g' },
  { clave: 'grasa', col: 'fat_100g' },
  { clave: 'grasaSaturada', col: 'saturated-fat_100g' },
  { clave: 'fibra', col: 'fiber_100g' },
  { clave: 'azucares', col: 'sugars_100g' },
  { clave: 'sodio', col: 'sodium_100g', factor: 1000 },
  { clave: 'grasa_trans_g', col: 'trans-fat_100g', micro: true },
  { clave: 'colesterol_mg', col: 'cholesterol_100g', factor: 1000, micro: true },
  { clave: 'calcio_mg', col: 'calcium_100g', factor: 1000, micro: true },
  { clave: 'hierro_mg', col: 'iron_100g', factor: 1000, micro: true },
  { clave: 'potasio_mg', col: 'potassium_100g', factor: 1000, micro: true },
  { clave: 'vitamina_c_mg', col: 'vitamin-c_100g', factor: 1000, micro: true },
  { clave: 'vitamina_a_ug', col: 'vitamin-a_100g', factor: 1e6, micro: true },
  { clave: 'vitamina_d_ug', col: 'vitamin-d_100g', factor: 1e6, micro: true },
  { clave: 'cafeina_mg', col: 'caffeine_100g', factor: 1000, micro: true },
  { clave: 'alcohol_g', col: 'alcohol_100g', micro: true },
];

export function nutrientesDesdeOff(fila: Record<string, string>): Nutrientes {
  const n: Nutrientes = {};
  const micros: Record<string, number> = {};
  for (const m of MAPA_OFF) {
    const raw = fila[m.col];
    if (raw === undefined || raw === '') continue;
    let v = Number(raw);
    if (!Number.isFinite(v)) continue;
    v *= m.factor ?? 1;
    const red = r(v, m.clave === 'kcal' || m.clave === 'sodio' ? 1 : 2)!;
    if (m.micro) micros[m.clave] = red;
    else (n as Record<string, number>)[m.clave] = red;
  }
  if (n.kcal === undefined) {
    // energy_100g de OFF está en kJ
    const kjRaw = fila['energy-kj_100g'] || fila['energy_100g'];
    const kj = Number(kjRaw);
    if (kjRaw && Number.isFinite(kj)) n.kcal = r(kj / 4.184, 1);
  }
  if (Object.keys(micros).length) n.micros = micros;
  return n;
}
