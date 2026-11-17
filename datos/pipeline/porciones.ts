import type { Porcion, UnidadId } from '../../src/tipos.ts';
import { traducirPorcion } from './traducir.ts';
import { r } from './util.ts';

const PIEZA = new Set(
  `each piece pieces large medium small extra jumbo slice slices item items fruit egg eggs tortilla tortillas taco tacos
  burrito burritos sandwich sandwiches patty patties fillet fillets filet breast wing wings leg legs thigh thighs
  drumstick drumsticks bar bars cookie cookies cracker crackers muffin muffins roll rolls bun buns bagel bagels donut
  doughnut pancake pancakes waffle waffles tamale tamales enchilada enchiladas quesadilla quesadillas stalk spear spears
  clove cloves leaf leaves link links strip strips nugget nuggets wedge wedges chop chops steak sausage frank frankfurter
  wiener hot dog biscuit biscuits croissant tostada tostadas taquito flauta gordita sope pupusa chimichanga empanada
  churro pie tart cupcake brownie popsicle cone sundae pizza pear apple banana orange peach plum potato tomato onion
  carrot pepper ear cob head bulb stick sticks square squares ball balls cube cubes shrimp oyster clam scallop
  piezas pieza rebanada unidad mini miniature regular whole half`.split(/\s+/),
);

const FRACCIONES: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

/** "1 1/2 cup" → 1.5; "0.5" → 0.5; "1/4" → 0.25; sin número → 1. */
export function cantidadInicial(texto: string): { cantidad: number; resto: string } {
  let t = texto.trim();
  for (const [k, v] of Object.entries(FRACCIONES)) t = t.replace(k, ` ${v} `);
  const m = /^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?|^(\d+)\/(\d+)/.exec(t.trim());
  if (!m) return { cantidad: 1, resto: t };
  let c: number;
  if (m[4]) c = Number(m[4]) / Number(m[5]);
  else {
    c = Number(m[1]);
    if (m[2]) c += Number(m[2]) / Number(m[3]);
  }
  return { cantidad: c > 0 ? c : 1, resto: t.trim().slice(m[0].length).trim() };
}

/** Clasifica el texto (en inglés o español) de una medida casera. */
export function unidadDeTexto(texto: string): UnidadId {
  const t = texto.toLowerCase();
  if (/\bfl\.?\s?oz\b|\bfluid ounce/.test(t)) return 'porcion';
  if (/\bcups?\b|\btazas?\b|\bc\.?\b(?=\s|$)/.test(t)) return 'taza';
  if (/\btbsps?\b|\btablespoons?\b|\btbs\b|\bcucharadas?\b|\bcda\b/.test(t)) return 'cucharada';
  if (/\btsps?\b|\bteaspoons?\b|\bcucharaditas?\b|\bcdta\b/.test(t)) return 'cucharadita';
  if (/\b(oz|ounces?|onzas?|lbs?|pounds?|g|grams?|gramos?|ml|mls|l|liters?|litros?)\b/.test(t)) return 'porcion';
  const palabras = t.replace(/[^a-záéíóúñ ]/g, ' ').split(/\s+/).filter(Boolean);
  if (palabras.some((p) => PIEZA.has(p))) return 'pieza';
  return 'porcion';
}

/** Etiqueta en español con la equivalencia: "1 taza, picada (150 g)". */
function etiquetar(textoEn: string, gramos: number, base: 'g' | 'ml', unidad: UnidadId, yaEspanol = false): string {
  let es = yaEspanol ? textoEn : traducirPorcion(textoEn);
  if (!/^\d/.test(es)) es = `1 ${es}`;
  // "1 grande" → "1 pieza grande"
  if (unidad === 'pieza' && /^\d+(?:[.,/]\d+)? (grande|mediano|mediana|chico|chica|pequeño|regular|extra grande|jumbo|mini)\b/.test(es))
    es = es.replace(/^(\d+(?:[.,/]\d+)?) /, '$1 pieza ');
  const eq = gramos >= 10 ? Math.round(gramos) : r(gramos, 1);
  return `${es} (${eq} ${base})`;
}

export interface PorcionCruda {
  /** texto en inglés o español tal como viene ("1 cup, chopped", "2 tbsp (30 g)") */
  texto: string;
  /** gramos (o ml) totales de esa medida */
  gramos: number;
  /** cantidad numérica si la fuente la da aparte */
  cantidad?: number;
  espanol?: boolean;
}

export function construirPorciones(crudas: PorcionCruda[], base: 'g' | 'ml', nombreAlimento = ''): Porcion[] {
  const salida: Porcion[] = [];
  const vistos = new Set<string>();
  for (const c of crudas) {
    if (!(c.gramos > 0) || c.gramos > 5000) continue;
    const texto = c.texto.replace(/\s+/g, ' ').trim();
    if (!texto || /quantity not specified/i.test(texto)) continue;
    const { cantidad } = c.cantidad && c.cantidad > 0 ? { cantidad: c.cantidad } : cantidadInicial(texto);
    const unidad = unidadDeTexto(texto);
    const textoCompleto = c.cantidad && !/^\d/.test(texto) ? `${fmt(c.cantidad)} ${texto}` : texto;
    const etiqueta = etiquetar(textoCompleto, c.gramos, base, unidad, c.espanol);
    if (vistos.has(etiqueta)) continue;
    vistos.add(etiqueta);
    // "equivalencia" = base por 1 unidad. Para 'porcion' la etiqueta describe la medida completa.
    const equivalencia = unidad === 'porcion' ? c.gramos : c.gramos / cantidad;
    salida.push({ etiqueta: unidad === 'porcion' ? etiqueta : etiquetaUnitaria(etiqueta, cantidad, equivalencia, base), unidad, equivalencia: r(equivalencia, 2)! });
  }
  const idx = indicePredeterminada(salida, nombreAlimento);
  if (salida[idx]) salida[idx].predeterminada = true;
  return salida.slice(0, 12);
}

/** Piezas que nombran un platillo distinto (USDA da "1 enchilada" o "1 taco" para la tortilla). */
const PLATILLOS = /^[\d.,/ ]+(enchiladas?|tacos?|burritos?|tostadas?|quesadillas?|tamales?|flautas?|gorditas?|sopes?|chimichangas?|taquitos?)\b/i;

/**
 * Porción predeterminada: pieza mediana > pieza > taza > primera, pero descartando las
 * piezas que nombran OTRO platillo ("Tortilla de maíz" → no "1 enchilada", sí "1 tortilla").
 */
export function indicePredeterminada(salida: Porcion[], nombreAlimento = ''): number {
  const nombre = sinAcentos(nombreAlimento.toLowerCase());
  const piezas = salida.map((p, i) => ({ p, i })).filter(({ p }) => p.unidad === 'pieza');
  const etq = (p: Porcion) => sinAcentos(p.etiqueta.toLowerCase());
  const ajena = (p: Porcion) => {
    const m = PLATILLOS.exec(etq(p));
    return !!m && !nombre.includes(m[1].replace(/(es|s)$/, ''));
  };
  const limpias = piezas.filter(({ p }) => !ajena(p));
  const mediana = limpias.find(({ p }) => /median/.test(p.etiqueta));
  if (mediana) return mediana.i;
  if (limpias.length) return limpias[0].i;
  if (piezas.length) return piezas[0].i;
  const taza = salida.findIndex((p) => p.unidad === 'taza');
  return taza >= 0 ? taza : 0;
}

function sinAcentos(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : String(r(n, 2));
}

/** Para unidades contables, la etiqueta describe UNA unidad: "1/2 taza (120 g)" → "1 taza (240 g)". */
function etiquetaUnitaria(etiqueta: string, cantidad: number, equivalencia: number, base: string): string {
  if (Math.abs(cantidad - 1) < 1e-9) return etiqueta;
  const eq = equivalencia >= 10 ? Math.round(equivalencia) : r(equivalencia, 1);
  return etiqueta.replace(/^\d+(?:\.\d+)?(?: \d+\/\d+)?|^\d+\/\d+/, '1').replace(/\(\d+(?:\.\d+)? (g|ml)\)$/, `(${eq} ${base})`);
}

/** Densidad (g/ml) deducida SOLO de medidas líquidas explícitas (onzas líquidas o ml declarados). */
export function densidadDeTexto(texto: string, gramos: number, cantidad?: number): number | undefined {
  const t = texto.toLowerCase();
  let ml: number | undefined;
  const mMl = /(\d+(?:\.\d+)?)\s*ml\b/.exec(t);
  const mFl = /(\d+(?:\.\d+)?(?:\s+\d\/\d)?)?\s*fl\.?\s?oz\b/.exec(t);
  if (mMl) ml = Number(mMl[1]);
  else if (mFl) ml = (cantidad ?? (mFl[1] ? cantidadInicial(mFl[1]).cantidad : 1)) * 29.5735;
  if (!ml || !(gramos > 0)) return undefined;
  const d = gramos / ml;
  return d >= 0.5 && d <= 2.0 ? r(d, 3) : undefined;
}
