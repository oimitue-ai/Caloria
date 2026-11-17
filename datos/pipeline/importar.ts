/**
 * Importadores → registros normalizados {a: Alimento, p: procedencia}.
 * Fuentes: USDA FoodData Central (JSON oficial; un objeto por línea, se lee en streaming) y
 * Open Food Facts (TSV oficial filtrado a México, .tsv o .tsv.gz).
 */
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import type { Readable } from 'node:stream';
import type { Alimento, FuenteId } from '../../src/tipos.ts';
import { normalizarCodigoBarras } from '../../src/catalogo/normalizar.ts';
import { nutrientesDesdeOff, nutrientesDesdeUsda, IDS_USDA_USADOS } from './nutrientes.ts';
import { construirPorciones, densidadDeTexto, type PorcionCruda } from './porciones.ts';
import { capitalizarSiMayusculas, CRUDOS, ESPEJOS, fechaIso, leerJson, leerTsv, lineas, listarZip, r, unzipStream } from './util.ts';

export interface Registro {
  a: Alimento;
  /** procedencia y valores originales (se guardan aparte, no van al catálogo) */
  p: Record<string, unknown>;
}

export interface ArchivoFuente {
  fuente: FuenteId;
  ruta: string;
  /** miembro dentro del zip (si es zip) */
  miembro?: string;
  version: string;
  procedencia: string;
}

const USDA = join(CRUDOS, 'usda');
const OFF = join(CRUDOS, 'off');

/** Localiza el archivo de cada fuente: oficial en crudos/usda|off; si falta, espejo verificado. */
export async function localizarFuentes(): Promise<Partial<Record<FuenteId, ArchivoFuente>>> {
  const res: Partial<Record<FuenteId, ArchivoFuente>> = {};
  const zips = existsSync(USDA) ? readdirSync(USDA).filter((f) => f.endsWith('.zip')) : [];
  const patrones: [FuenteId, RegExp][] = [
    ['usda_foundation', /foundation_food_json_([\d-]+)\.zip$/],
    ['usda_sr_legacy', /sr_legacy_food_json_([\d-]+)\.zip$/],
    ['usda_fndds', /survey_food_json_([\d-]+)\.zip$/],
    ['usda_branded', /branded_food_json_([\d-]+)\.zip$/],
  ];
  for (const [fuente, re] of patrones) {
    const z = zips.filter((f) => re.test(f)).sort().pop();
    if (!z) continue;
    const ruta = join(USDA, z);
    const miembros = (await listarZip(ruta)).filter((m) => m.endsWith('.json'));
    res[fuente] = { fuente, ruta, miembro: miembros[0], version: re.exec(z)![1], procedencia: `oficial: ${z}` };
  }
  if (!res.usda_fndds) {
    const espejo = join(ESPEJOS, 'matiasmorant_nutrition', 'surveyDownload.json');
    if (existsSync(espejo))
      res.usda_fndds = { fuente: 'usda_fndds', ruta: espejo, version: '2024-10-31', procedencia: 'espejo github.com/matiasmorant/nutrition (surveyDownload.json, mismo formato que el JSON oficial)' };
  }
  if (existsSync(OFF)) {
    const t = readdirSync(OFF).filter((f) => /\.tsv(\.gz)?$/.test(f)).sort().pop();
    if (t) res.off = { fuente: 'off', ruta: join(OFF, t), version: '', procedencia: `oficial: volcado CSV de Open Food Facts filtrado a México (${t})` };
  }
  return res;
}

function abrir(f: ArchivoFuente): Readable {
  if (f.miembro) return unzipStream(f.ruta, f.miembro);
  const s = createReadStream(f.ruta);
  return f.ruta.endsWith('.gz') ? s.pipe(createGunzip()) : s;
}

/**
 * Objetos del arreglo principal de un JSON de FoodData Central. Los archivos oficiales traen un objeto por
 * línea ("{...},"); si un objeto ocupa varias líneas, se acumulan hasta que el fragmento sea JSON válido.
 */
export async function* objetosFdc(f: ArchivoFuente): AsyncGenerator<any> {
  let buf = '';
  let primera = true;
  for await (const l0 of lineas(abrir(f))) {
    let l = l0;
    if (primera) {
      primera = false;
      const i = l.indexOf('[');
      if (i >= 0) l = l.slice(i + 1);
    }
    buf = buf ? buf + '\n' + l : l;
    let t = buf.trim();
    if (!t || t === ']}' || t === ']' || t === '}') {
      buf = '';
      continue;
    }
    if (t.endsWith(',')) t = t.slice(0, -1);
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      // última línea: "{...}]}" (cierra el arreglo y el objeto raíz)
      const m = /\]\s*\}\s*$/.exec(t);
      if (m) {
        try {
          o = JSON.parse(t.slice(0, m.index));
        } catch {
          /* objeto partido en varias líneas: seguir acumulando */
        }
      }
    }
    if (o !== undefined) {
      buf = '';
      yield o;
    } else if (buf.length > 50_000_000) throw new Error('objeto JSON demasiado grande o archivo corrupto');
  }
}

function valoresUsda(food: any): { valores: Map<number, number>; originales: [number, number, string][] } {
  const valores = new Map<number, number>();
  const originales: [number, number, string][] = [];
  for (const fn of food.foodNutrients ?? []) {
    const id = fn.nutrient?.id;
    const amount = fn.amount;
    if (typeof id !== 'number' || typeof amount !== 'number') continue;
    if (IDS_USDA_USADOS.has(id)) {
      valores.set(id, amount);
      originales.push([id, amount, fn.nutrient.unitName]);
    }
  }
  return { valores, originales };
}

function porcionesUsda(food: any): { crudas: PorcionCruda[]; densidad?: number } {
  const crudas: PorcionCruda[] = [];
  let densidad: number | undefined;
  for (const p of food.foodPortions ?? []) {
    const g = Number(p.gramWeight);
    if (!(g > 0)) continue;
    const unidad = p.measureUnit?.name && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
    const desc = p.portionDescription && !/^quantity not specified$/i.test(p.portionDescription) ? p.portionDescription : '';
    const mod = p.modifier && !/^\d+$/.test(String(p.modifier)) ? String(p.modifier) : '';
    let texto = [unidad, desc, mod].filter(Boolean).join(' ').trim();
    const cantidad = typeof p.amount === 'number' && p.amount > 0 ? p.amount : undefined;
    // FNDDS: "Guideline amount per fl oz of beverage" no son porciones caseras
    if (!texto || /guideline|amount per|amount on|per oz|yields/i.test(texto)) continue;
    crudas.push({ texto, gramos: g, cantidad: /^\d/.test(texto) ? undefined : cantidad });
    densidad ??= densidadDeTexto(texto, g, /^\d/.test(texto) ? undefined : cantidad);
  }
  return { crudas, densidad };
}

/** SR Legacy / Foundation / FNDDS (JSON oficial) → Registro. */
export function registroUsdaGenerico(food: any, fuente: FuenteId, archivo: string): Registro | null {
  if (fuente === 'usda_foundation' && food.foodClass && food.foodClass !== 'FinalFood') return null;
  const idOriginal = String(food.fdcId);
  const { valores, originales } = valoresUsda(food);
  const { crudas, densidad } = porcionesUsda(food);
  const descripcion = String(food.description ?? '').trim();
  const categoria = food.foodCategory?.description ?? food.wweiaFoodCategory?.wweiaFoodCategoryDescription;
  const a: Alimento = {
    id: `${fuente}:${idOriginal}`,
    fuente,
    idOriginal,
    nombre: descripcion,
    nombreOriginal: descripcion,
    idiomaOriginal: 'en',
    categoria,
    base: 'g',
    nutrientes: nutrientesDesdeUsda(valores),
    porciones: construirPorciones(crudas, 'g', descripcion),
    actualizado: fechaIso(food.publicationDate),
    validacion: 'oficial',
  };
  if (densidad) a.densidad = densidad;
  const p = {
    id: a.id,
    archivo,
    fdcId: food.fdcId,
    ndbNumber: food.ndbNumber,
    foodCode: food.foodCode,
    nutrientes: originales,
    porciones: crudas,
    densidadDe: densidad ? 'porción en onzas líquidas/ml de la fuente' : undefined,
  };
  return { a, p };
}

/** USDA Branded (JSON oficial) → Registro. */
export function registroUsdaBranded(food: any, archivo: string): Registro | null {
  const idOriginal = String(food.fdcId);
  const { valores, originales } = valoresUsda(food);
  const unidad = String(food.servingSizeUnit ?? '').toLowerCase();
  const base: 'g' | 'ml' = unidad === 'ml' || unidad === 'mlt' ? 'ml' : 'g';
  const gtin = normalizarCodigoBarras(food.gtinUpc);
  const marca = (food.brandName || food.brandOwner || '').trim() || undefined;
  const descripcion = String(food.description ?? '').trim();
  const crudas: PorcionCruda[] = [];
  const tam = Number(food.servingSize);
  const hogar = String(food.householdServingFullText ?? '').trim();
  let densidad: number | undefined;
  if (tam > 0 && (unidad === 'g' || unidad === 'grm' || base === 'ml')) {
    if (hogar && !/^\d+(\.\d+)?\s*(g|ml|grm|mlt)$/i.test(hogar)) crudas.push({ texto: hogar, gramos: tam });
    crudas.push({ texto: `1 porción`, gramos: tam, espanol: true });
    if (base === 'g' && hogar) densidad = densidadDeTexto(hogar, tam);
  }
  const porciones = construirPorciones(crudas, base);
  // la porción de la etiqueta es la sugerida
  if (porciones.length) {
    porciones.forEach((x) => delete x.predeterminada);
    porciones[0].predeterminada = true;
  }
  const a: Alimento = {
    id: `usda_branded:${idOriginal}`,
    fuente: 'usda_branded',
    idOriginal,
    nombre: capitalizarSiMayusculas(descripcion),
    nombreOriginal: descripcion,
    idiomaOriginal: 'en',
    categoria: food.brandedFoodCategory || undefined,
    marca: marca ? capitalizarSiMayusculas(marca) : undefined,
    codigoBarras: gtin ?? undefined,
    base,
    nutrientes: nutrientesDesdeUsda(valores),
    porciones,
    actualizado: fechaIso(food.publicationDate) ?? fechaIso(food.modifiedDate),
    validacion: 'etiqueta',
  };
  if (densidad) a.densidad = densidad;
  const p = {
    id: a.id,
    archivo,
    gtinUpc: food.gtinUpc,
    brandOwner: food.brandOwner,
    brandName: food.brandName,
    servingSize: food.servingSize,
    servingSizeUnit: food.servingSizeUnit,
    householdServingFullText: food.householdServingFullText,
    marketCountry: food.marketCountry,
    modifiedDate: food.modifiedDate,
    nutrientes: originales,
  };
  return { a, p };
}

/** Filas del TSV de Open Food Facts. */
export async function* filasOff(f: ArchivoFuente): AsyncGenerator<Record<string, string>> {
  yield* leerTsv(abrir(f));
}

const RE_ML = /(\d+(?:[.,]\d+)?)\s*(ml|mL|cl|l|lt|litros?|L)\b/;
const RE_G = /(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos?|kg)\b/i;

export function registroOff(fila: Record<string, string>, archivo: string): Registro | null {
  const code = (fila.code || '').trim();
  if (!code) return null;
  const nombreBase = (fila.product_name || '').trim();
  const generico = (fila.generic_name || '').trim();
  const nombre = nombreBase || generico;
  const cantidad = fila.quantity || '';
  const porcionTxt = (fila.serving_size || '').trim();
  const base: 'g' | 'ml' = RE_ML.test(cantidad) && !RE_G.test(cantidad) ? 'ml' : RE_ML.test(porcionTxt) && !RE_G.test(porcionTxt) && !cantidad ? 'ml' : 'g';
  const crudas: PorcionCruda[] = [];
  const sq = Number(fila.serving_quantity);
  if (sq > 0 && porcionTxt) {
    const esUnidadBase = /^\s*\d+(?:[.,]\d+)?\s*(g|gr|ml)\s*$/i.test(porcionTxt);
    if (!esUnidadBase) crudas.push({ texto: porcionTxt.replace(/\s*\(.*?\)\s*$/, ''), gramos: sq, espanol: /[áéíóúñ]|taza|pieza|cucharad|rebanad|porci/i.test(porcionTxt) });
    crudas.push({ texto: '1 porción', gramos: sq, espanol: true });
  }
  const porciones = construirPorciones(crudas, base);
  if (porciones.length) {
    porciones.forEach((x) => delete x.predeterminada);
    porciones[0].predeterminada = true;
  }
  const gtin = normalizarCodigoBarras(code);
  const paises = (fila.countries_tags || '').split(',').filter(Boolean);
  const marca = (fila.brands || '').split(',')[0]?.trim() || undefined;
  const a: Alimento = {
    id: `off:${code}`,
    fuente: 'off',
    idOriginal: code,
    nombre: nombre && generico && nombreBase && !nombreBase.toLowerCase().includes(generico.toLowerCase()) && generico.length < 40 ? `${nombreBase} (${generico})` : nombre,
    nombreOriginal: nombre,
    idiomaOriginal: 'es',
    categoria: (fila.main_category_en || '').replace(/^\w\w:/, '') || undefined,
    marca,
    codigoBarras: gtin ?? undefined,
    base,
    nutrientes: nutrientesDesdeOff(fila),
    porciones,
    actualizado: fechaIso(fila.last_modified_t),
    validacion: 'comunidad',
    mexicano: paises.includes('en:mexico') || undefined,
  };
  const p = {
    id: a.id,
    archivo,
    code,
    quantity: cantidad,
    serving_size: porcionTxt,
    serving_quantity: fila.serving_quantity,
    countries_tags: fila.countries_tags,
    brands: fila.brands,
    nutriments: Object.fromEntries(Object.entries(fila).filter(([k, v]) => k.endsWith('_100g') && v !== '')),
  };
  return { a, p };
}

/** Nombres en español curados a mano para SR Legacy (Ronyol012/Food-Full-Data-Base, CC BY 4.0). */
export function nombresCurados(): Map<string, { nombre: string; alias: string[] }> {
  const m = new Map<string, { nombre: string; alias: string[] }>();
  const ruta = join(ESPEJOS, 'Ronyol012_Food-Full-Data-Base', 'data', 'alimentos.json');
  if (!existsSync(ruta)) return m;
  const d = leerJson<any>(ruta);
  for (const x of d.alimentos ?? []) {
    if (x.traduccion !== 'curada' || !x.fdc_id || !x.nombre) continue;
    m.set(String(x.fdc_id), { nombre: x.nombre, alias: Array.isArray(x.alias) ? x.alias : [] });
  }
  return m;
}

export { r };
