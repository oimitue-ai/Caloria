/**
 * Publicación del catálogo estático en public/catalogo/:
 *   base/indice-NNN.json   filas compactas para el buscador en memoria (genéricos + mexicanos + recetas)
 *   base/detalle-NNN.json  Alimento completo por id (descarga completa → uso sin conexión)
 *   marcas/<fuente>/terminos/<prefijo>.json   directorio de frecuencias: término → [df, clave, partes]
 *   marcas/<fuente>/terminos/_directorio.json prefijos existentes (subdivisión adaptativa)
 *   marcas/<fuente>/indice/<clave>[.<parte>].json  término → filas compactas (orden estático de relevancia)
 *   marcas/<fuente>/detalle/<h>.json  idOriginal → Alimento (h = hash32(idOriginal) % S)
 *   marcas/codigos/<prefijo>.json     GTIN-13 → [ids]; marcas/codigos/_directorio.json
 *   manifiesto.json                   ManifiestoCatalogo + estadísticas reales
 */
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Alimento, FuenteId, FuenteManifiesto } from '../../src/tipos.ts';
import { hash32, normalizar, tokensUnicos } from '../../src/catalogo/normalizar.ts';
import type { EstadisticasFuente } from './construir.ts';
import type { ResultadoRecetas } from './recetas.ts';
import { CATALOGO, INTERMEDIO, asegurarDir, escribirJson, existe, leerNdjson, log } from './util.ts';

export const FORMATO = 1;
const LIM_BASE = 1_300_000;
const LIM_INDICE = 250_000;
const LIM_VOCAB = 120_000;
const LIM_CODIGOS = 120_000;
const POR_DETALLE = 350;

export const INFO_FUENTES: Record<string, Omit<FuenteManifiesto, 'registros' | 'fechaImportacion' | 'version'>> = {
  usda_foundation: {
    id: 'usda_foundation', nombre: 'USDA FoodData Central — Foundation Foods', licencia: 'Dominio público (CC0 1.0)',
    atribucion: 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central: Foundation Foods. fdc.nal.usda.gov', url: 'https://fdc.nal.usda.gov/download-datasets',
  },
  usda_sr_legacy: {
    id: 'usda_sr_legacy', nombre: 'USDA FoodData Central — SR Legacy', licencia: 'Dominio público (CC0 1.0)',
    atribucion: 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central: SR Legacy (2018). fdc.nal.usda.gov. Nombres en español de 875 alimentos: "Alimentos ES" (Ronyol012/Food-Full-Data-Base), CC BY 4.0.', url: 'https://fdc.nal.usda.gov/download-datasets',
  },
  usda_fndds: {
    id: 'usda_fndds', nombre: 'USDA FoodData Central — FNDDS 2021-2023 (Survey Foods)', licencia: 'Dominio público (CC0 1.0)',
    atribucion: 'U.S. Department of Agriculture, Agricultural Research Service. Food and Nutrient Database for Dietary Studies 2021-2023. fdc.nal.usda.gov', url: 'https://fdc.nal.usda.gov/download-datasets',
  },
  usda_branded: {
    id: 'usda_branded', nombre: 'USDA FoodData Central — Global Branded Food Products', licencia: 'Dominio público (CC0 1.0)',
    atribucion: 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central: Branded Foods (datos de etiqueta aportados por la industria). fdc.nal.usda.gov', url: 'https://fdc.nal.usda.gov/download-datasets',
  },
  off: {
    id: 'off', nombre: 'Open Food Facts (productos vendidos en México)', licencia: 'ODbL 1.0 (base de datos) + DbCL 1.0 (contenidos)',
    atribucion: 'Datos de Open Food Facts (https://world.openfoodfacts.org), disponibles bajo la Open Database License (ODbL). Conjunto separado, sin fusionar con otras fuentes.', url: 'https://world.openfoodfacts.org/data',
  },
  caloria_recetas: {
    id: 'caloria_recetas', nombre: 'CALORÍA — platillos mexicanos por receta estandarizada', licencia: 'Cálculo propio a partir de USDA (dominio público)',
    atribucion: 'Valores estimados por CALORÍA con recetas típicas e ingredientes de USDA FoodData Central; la preparación real varía.', url: '',
  },
};

/** Fila compacta del índice base (posiciones documentadas en docs/API_CATALOGO.md). */
export type FilaBase = [
  id: string, nombre: string, nombreOriginal: string, sinonimos: string, categoria: string, marca: string,
  fuente: FuenteId, validacion: string, base: string, kcal: number | null, proteina: number | null,
  carbohidratos: number | null, grasa: number | null, porcion: [string, string, number] | 0, mexicano: 0 | 1,
  detalle: number, atipico: 0 | 1,
];

function sinId(a: Alimento): Omit<Alimento, 'id'> {
  const { id: _id, ...resto } = a;
  return resto;
}

function filaBase(a: Alimento, d: number): FilaBase {
  const ps = a.porciones.find((p) => p.predeterminada) ?? a.porciones[0];
  return [
    a.id, a.nombre, a.nombreOriginal !== a.nombre ? a.nombreOriginal : '', (a.sinonimos ?? []).join('|'), a.categoria ?? '',
    a.marca ?? '', a.fuente, a.validacion, a.base, a.nutrientes.kcal ?? null, a.nutrientes.proteina ?? null,
    a.nutrientes.carbohidratos ?? null, a.nutrientes.grasa ?? null, ps ? [ps.etiqueta, ps.unidad, ps.equivalencia] : 0,
    a.mexicano ? 1 : 0, d, a.atipico ? 1 : 0,
  ];
}

async function* leer(fuente: string): AsyncGenerator<Alimento> {
  const ruta = join(INTERMEDIO, `${fuente}.ndjson`);
  if (!existe(ruta)) return;
  yield* leerNdjson<Alimento>(ruta);
}

/** ── Catálogo base ── */
async function publicarBase(dir: string) {
  rmSync(dir, { recursive: true, force: true });
  asegurarDir(dir);
  const todos: Alimento[] = [];
  for (const f of ['caloria_recetas', 'usda_sr_legacy', 'usda_fndds', 'usda_foundation']) for await (const a of leer(f)) todos.push(a);
  // equivalentes entre fuentes genéricas: misma descripción original normalizada (sin fusionar valores)
  const porNombre = new Map<string, string[]>();
  for (const a of todos) {
    if (a.fuente === 'caloria_recetas') continue;
    const k = normalizar(a.nombreOriginal);
    const l = porNombre.get(k) ?? [];
    l.push(a.id);
    porNombre.set(k, l);
  }
  let enlazados = 0;
  const porId = new Map(todos.map((a) => [a.id, a]));
  for (const ids of porNombre.values()) {
    if (ids.length < 2) continue;
    const fuentes = new Set(ids.map((i) => porId.get(i)!.fuente));
    if (fuentes.size < 2) continue;
    for (const i of ids) {
      porId.get(i)!.equivalentes = ids.filter((x) => x !== i);
      enlazados++;
    }
  }
  // detalle en fragmentos ≤ LIM_BASE
  let d = 0;
  let actual: Record<string, unknown> = {};
  let tam = 2;
  const filas: FilaBase[] = [];
  const archivosDetalle: string[] = [];
  const volcar = () => {
    const nombre = `detalle-${String(d).padStart(3, '0')}.json`;
    escribirJson(join(dir, nombre), actual);
    archivosDetalle.push(nombre);
    d++;
    actual = {};
    tam = 2;
  };
  for (const a of todos) {
    const s = JSON.stringify(sinId(a));
    if (tam + s.length + a.id.length + 4 > LIM_BASE) volcar();
    actual[a.id] = sinId(a);
    tam += s.length + a.id.length + 4;
    filas.push(filaBase(a, d));
  }
  if (Object.keys(actual).length) volcar();
  // índice en fragmentos ≤ LIM_BASE
  const archivosIndice: string[] = [];
  let lote: FilaBase[] = [];
  tam = 0;
  const volcarIndice = () => {
    const nombre = `indice-${String(archivosIndice.length).padStart(3, '0')}.json`;
    escribirJson(join(dir, nombre), { formato: FORMATO, filas: lote });
    archivosIndice.push(nombre);
    lote = [];
    tam = 0;
  };
  for (const f of filas) {
    const s = JSON.stringify(f).length + 1;
    if (tam + s > LIM_BASE) volcarIndice();
    lote.push(f);
    tam += s;
  }
  if (lote.length) volcarIndice();
  const conteo: Record<string, number> = {};
  let mexicanos = 0;
  for (const a of todos) {
    conteo[a.fuente] = (conteo[a.fuente] ?? 0) + 1;
    if (a.mexicano) mexicanos++;
  }
  log(`base: ${todos.length} registros, ${archivosIndice.length} índices, ${archivosDetalle.length} detalles; equivalentes por nombre: ${enlazados}`);
  return { registros: todos.length, porFuente: conteo, mexicanos, archivosIndice, archivosDetalle, equivalentesPorNombre: enlazados };
}

/** ── Marcas ── */
interface Producto {
  idOriginal: string;
  fila: string; // JSON de la fila compacta
  terminos: string[];
  /** términos que vienen de la marca */
  deMarca: Set<string>;
  rango: number;
}

/** Fila compacta de marcas: [idOriginal, nombre, marca, kcal, banderas] — banderas: 1 = base ml, 2 = mexicano, 4 = atípico */
function filaMarca(a: Alimento): string {
  const b = (a.base === 'ml' ? 1 : 0) | (a.mexicano ? 2 : 0) | (a.atipico ? 4 : 0);
  return JSON.stringify([a.idOriginal, a.nombre, a.marca ?? '', a.nutrientes.kcal ?? null, b]);
}

/** Detalle de marcas sin campos derivables (el cliente los restituye: id, fuente, idOriginal, validacion,
 *  idiomaOriginal; nombreOriginal = nombre en MAYÚSCULAS cuando `nO` = 1). */
function detalleMarca(a: Alimento): Record<string, unknown> {
  const { id: _i, fuente: _f, idOriginal: _o, validacion: _v, idiomaOriginal, nombreOriginal, ...resto } = a;
  const o: Record<string, unknown> = { ...resto };
  if (nombreOriginal === a.nombre) o.nO = 2;
  else if (nombreOriginal === a.nombre.toUpperCase()) o.nO = 1;
  else o.nombreOriginal = nombreOriginal;
  if (idiomaOriginal !== (a.fuente === 'off' ? 'es' : 'en')) o.idiomaOriginal = idiomaOriginal;
  return o;
}

const RUIDO_MARCA = new Set(['inc', 'llc', 'ltd', 'co', 'corp', 'corporation', 'company', 'sa', 'cv', 'de', 'the']);

function terminosProducto(a: Alimento): string[] {
  return tokensUnicos(`${a.nombre} ${a.marca ?? ''}`).filter((t) => t.length >= 2 && /[a-z]/.test(t) && t.length <= 30 && !RUIDO_MARCA.has(t));
}

/** Agrupa términos por prefijo con subdivisión adaptativa. Devuelve clave → términos. */
function agruparAdaptativo(terminos: Map<string, number>, limite: number, largoInicial = 1): Map<string, string[]> {
  const grupos = new Map<string, string[]>();
  const rec = (prefijo: string, lista: string[]) => {
    const total = lista.reduce((s, t) => s + terminos.get(t)!, 0);
    if (total <= limite || lista.length === 1 || prefijo.length >= 12) {
      grupos.set(prefijo, lista);
      return;
    }
    const exactos = lista.filter((t) => t.length <= prefijo.length);
    if (exactos.length) grupos.set(prefijo + '_', exactos);
    const sub = new Map<string, string[]>();
    for (const t of lista) {
      if (t.length <= prefijo.length) continue;
      const k = t.slice(0, prefijo.length + 1);
      const l = sub.get(k) ?? [];
      l.push(t);
      sub.set(k, l);
    }
    for (const [k, l] of sub) rec(k, l);
  };
  const ini = new Map<string, string[]>();
  for (const t of terminos.keys()) {
    const k = t.slice(0, largoInicial);
    const l = ini.get(k) ?? [];
    l.push(t);
    ini.set(k, l);
  }
  for (const [k, l] of ini) rec(k, l);
  return grupos;
}

async function publicarFuenteMarcas(fuente: 'usda_branded' | 'off', dir: string, codigos: Map<string, string[]>) {
  const base = join(dir, fuente);
  rmSync(base, { recursive: true, force: true });
  asegurarDir(join(base, 'indice'));
  asegurarDir(join(base, 'terminos'));
  asegurarDir(join(base, 'detalle'));
  const productos: Producto[] = [];
  let mexicanos = 0;
  let bytesDetalle = 0;
  for await (const a of leer(fuente)) {
    const terminos = terminosProducto(a);
    // rango estático: mexicanos primero, luego nombres cortos, luego con kcal completas
    const rango = (a.mexicano ? 0 : 1_000) + Math.min(a.nombre.length, 200) + (a.atipico ? 300 : 0);
    const deMarca = new Set(tokensUnicos(a.marca ?? ''));
    productos.push({ idOriginal: a.idOriginal, fila: filaMarca(a), terminos, deMarca, rango });
    if (a.mexicano) mexicanos++;
    bytesDetalle += JSON.stringify(a).length;
  }
  // ── índice invertido
  const post = new Map<string, number[]>();
  productos.forEach((p, i) => {
    for (const t of p.terminos) {
      let l = post.get(t);
      if (!l) post.set(t, (l = []));
      l.push(i);
    }
  });
  const tamTermino = new Map<string, number>();
  for (const [t, l] of post) {
    l.sort((x, y) => productos[x].rango - productos[y].rango);
    tamTermino.set(t, l.reduce((s, i) => s + productos[i].fila.length + 1, t.length + 6));
  }
  const grupos = agruparAdaptativo(tamTermino, LIM_INDICE);
  // [df, clave de archivo, partes, df como marca]: el cliente da prioridad de marca solo a términos "de marca"
  const vocab = new Map<string, [number, string, number, number]>();
  const dfMarca = (t: string) => post.get(t)!.reduce((s, i) => s + (productos[i].deMarca.has(t) ? 1 : 0), 0);
  let archivosIndice = 0;
  let bytesIndice = 0;
  for (const [clave, terms] of grupos) {
    const total = terms.reduce((s, t) => s + tamTermino.get(t)!, 0);
    if (terms.length === 1 && total > LIM_INDICE) {
      // término muy frecuente: se parte en varias páginas
      const t = terms[0];
      const l = post.get(t)!;
      let parte = 0;
      let buf: string[] = [];
      let tam = 0;
      const volcar = () => {
        const s = `{"${t}":[${buf.join(',')}]}`;
        escribirTexto(join(base, 'indice', `${clave}.${parte}.json`), s);
        bytesIndice += s.length;
        archivosIndice++;
        parte++;
        buf = [];
        tam = 0;
      };
      for (const i of l) {
        if (tam + productos[i].fila.length > LIM_INDICE && buf.length) volcar();
        buf.push(productos[i].fila);
        tam += productos[i].fila.length + 1;
      }
      if (buf.length) volcar();
      vocab.set(t, [l.length, clave, parte, dfMarca(t)]);
    } else {
      const partes = terms.map((t) => `"${t}":[${post.get(t)!.map((i) => productos[i].fila).join(',')}]`);
      const s = `{${partes.join(',')}}`;
      escribirTexto(join(base, 'indice', `${clave}.json`), s);
      bytesIndice += s.length;
      archivosIndice++;
      for (const t of terms) vocab.set(t, [post.get(t)!.length, clave, 1, dfMarca(t)]);
    }
  }
  // ── directorio de frecuencias (vocabulario) con subdivisión adaptativa
  const tamVocab = new Map<string, number>();
  for (const t of vocab.keys()) tamVocab.set(t, t.length + 30);
  const gruposVocab = agruparAdaptativo(tamVocab, LIM_VOCAB);
  for (const [clave, terms] of gruposVocab) {
    const o: Record<string, [number, string, number, number]> = {};
    for (const t of terms.sort()) o[t] = vocab.get(t)!;
    escribirJson(join(base, 'terminos', `${clave}.json`), o);
  }
  escribirJson(join(base, 'terminos', '_directorio.json'), { formato: FORMATO, prefijos: [...gruposVocab.keys()].sort(), terminos: vocab.size });
  // ── detalle por hash del id (varias pasadas para acotar memoria)
  const S = Math.max(1, Math.ceil(productos.length / POR_DETALLE));
  const pasadas = Math.max(1, Math.ceil(bytesDetalle / 250_000_000));
  for (let pasada = 0; pasada < pasadas; pasada++) {
    const cubetas = new Map<number, string[]>();
    for await (const a of leer(fuente)) {
      const h = hash32(a.idOriginal) % S;
      if (h % pasadas !== pasada) continue;
      if (a.codigoBarras) {
        const eq = (codigos.get(a.codigoBarras) ?? []).filter((x) => x !== a.id);
        if (eq.length) a.equivalentes = eq;
      }
      const l = cubetas.get(h) ?? [];
      l.push(`${JSON.stringify(a.idOriginal)}:${JSON.stringify(detalleMarca(a))}`);
      cubetas.set(h, l);
    }
    for (const [h, l] of cubetas) escribirTexto(join(base, 'detalle', `${h}.json`), `{${l.join(',')}}`);
  }
  escribirJson(join(base, 'info.json'), { formato: FORMATO, fuente, productos: productos.length, cubetasDetalle: S, terminos: vocab.size, archivosIndice });
  log(`marcas ${fuente}: ${productos.length} productos, ${vocab.size} términos, ${archivosIndice} archivos de índice (${Math.round(bytesIndice / 1e6)} MB), ${S} de detalle`);
  return { productos: productos.length, mexicanos, terminos: vocab.size, archivosIndice, cubetasDetalle: S };
}

import { writeFileSync } from 'node:fs';
function escribirTexto(ruta: string, s: string) {
  writeFileSync(ruta, s);
}

async function publicarMarcas(dir: string) {
  asegurarDir(dir);
  // códigos de barras de ambas fuentes → equivalentes (sin fusionar valores)
  const codigos = new Map<string, string[]>();
  for (const f of ['usda_branded', 'off'])
    for await (const a of leer(f)) {
      if (!a.codigoBarras) continue;
      const l = codigos.get(a.codigoBarras) ?? [];
      l.push(a.id);
      codigos.set(a.codigoBarras, l);
    }
  let enAmbas = 0;
  for (const l of codigos.values()) if (l.length > 1) enAmbas++;
  const res: Record<string, unknown> = {};
  for (const f of ['usda_branded', 'off'] as const) if (existe(join(INTERMEDIO, `${f}.ndjson`))) res[f] = await publicarFuenteMarcas(f, dir, codigos);
  // fragmentos por prefijo de código de barras
  const dc = join(dir, 'codigos');
  rmSync(dc, { recursive: true, force: true });
  asegurarDir(dc);
  const tam = new Map<string, number>();
  for (const [c, l] of codigos) tam.set(c, c.length + l.reduce((s, x) => s + x.length + 3, 4));
  const grupos = agruparAdaptativo(tam, LIM_CODIGOS, 3);
  for (const [clave, cs] of grupos) {
    const o: Record<string, string[]> = {};
    for (const c of cs) o[c] = codigos.get(c)!;
    escribirJson(join(dc, `${clave}.json`), o);
  }
  escribirJson(join(dc, '_directorio.json'), { formato: FORMATO, prefijos: [...grupos.keys()].sort() });
  log(`códigos de barras: ${codigos.size} (en ambas fuentes: ${enAmbas}), ${grupos.size} archivos`);
  return { fuentes: res, codigosBarras: codigos.size, codigosEnAmbasFuentes: enAmbas, archivosCodigos: grupos.size };
}

function medir(dir: string) {
  let archivos = 0;
  let bytes = 0;
  let mayor = { ruta: '', bytes: 0 };
  const rec = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (p !== join(dir, 'manifiesto.json')) {
        const s = statSync(p).size;
        archivos++;
        bytes += s;
        if (s > mayor.bytes) mayor = { ruta: p.slice(dir.length + 1), bytes: s };
      }
    }
  };
  if (existe(dir)) rec(dir);
  return { archivos, bytes, mayor };
}

export async function publicar(o: { estadisticas: EstadisticasFuente[]; recetas: ResultadoRecetas; soloBase?: boolean }) {
  asegurarDir(CATALOGO);
  const base = await publicarBase(join(CATALOGO, 'base'));
  const soloBase = o.soloBase && existe(join(CATALOGO, 'marcas'));
  // --solo=base no vuelve a publicar marcas: se conserva su sección del manifiesto anterior (sin ella el cliente
  // deja de buscar productos de marca). Auditoría (Agente 4).
  const anterior = soloBase && existe(join(CATALOGO, 'manifiesto.json'))
    ? (JSON.parse(readFileSync(join(CATALOGO, 'manifiesto.json'), 'utf8')) as { marcas?: Awaited<ReturnType<typeof publicarMarcas>> })
    : null;
  const marcas = soloBase ? (anterior?.marcas ?? null) : await publicarMarcas(join(CATALOGO, 'marcas'));
  const hoy = new Date().toISOString();
  const fuentes: FuenteManifiesto[] = [];
  const contar = async (f: string) => {
    let n = 0;
    for await (const _ of leer(f)) n++;
    return n;
  };
  for (const e of o.estadisticas) {
    fuentes.push({ ...INFO_FUENTES[e.fuente], version: e.version, registros: await contar(e.fuente), fechaImportacion: hoy.slice(0, 10) } as FuenteManifiesto);
  }
  fuentes.push({ ...INFO_FUENTES.caloria_recetas, version: '1', registros: o.recetas.registros.length, fechaImportacion: hoy.slice(0, 10) } as FuenteManifiesto);
  const total = fuentes.reduce((s, f) => s + f.registros, 0);
  const m = medir(CATALOGO);
  const manifiesto = {
    version: hoy.slice(0, 19).replace(/[-:T]/g, ''),
    generado: hoy,
    totalRegistros: total,
    fuentes,
    formato: FORMATO,
    base: { registros: base.registros, porFuente: base.porFuente, mexicanos: base.mexicanos, indices: base.archivosIndice, detalles: base.archivosDetalle },
    marcas: marcas ?? undefined,
    limpieza: Object.fromEntries(o.estadisticas.map((e) => [e.fuente, { archivo: e.archivo, procedencia: e.procedencia, leidos: e.leidos, importados: e.importados, descartados: e.descartados, atipicosMarcados: e.atipicos, duplicados: e.duplicados, mexicanos: e.mexicanos, traduccion: e.traduccion }])),
    duplicados: {
      genericosEquivalentesPorNombre: base.equivalentesPorNombre,
      codigosBarrasEnUsdaYOff: marcas?.codigosEnAmbasFuentes,
    },
    recetas: o.recetas.estadisticas,
    archivos: { total: m.archivos + 1, bytes: m.bytes, mayor: m.mayor },
  };
  escribirJson(join(CATALOGO, 'manifiesto.json'), manifiesto, true);
  log(`catálogo: ${m.archivos + 1} archivos, ${(m.bytes / 1e6).toFixed(1)} MB, mayor ${m.mayor.ruta} ${(m.mayor.bytes / 1e6).toFixed(2)} MB`);
}
