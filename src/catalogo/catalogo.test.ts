/// <reference types="node" />
/**
 * Pruebas reales del catálogo publicado en public/catalogo (genera: `cd datos && npm run construir`).
 * Se usa el motor en el hilo principal con un cargador de archivos locales.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { crearServicioCatalogo, type ServicioCatalogoLocal } from './index.ts';
import { normalizar, normalizarCodigoBarras, raiz, tokenizar } from './normalizar.ts';
import { analizarConsulta } from './consulta.ts';

const RAIZ = join(process.cwd(), 'public', 'catalogo');
const leer = async (ruta: string) => {
  const p = join(RAIZ, ruta);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};
const manifiesto = existsSync(join(RAIZ, 'manifiesto.json')) ? JSON.parse(readFileSync(join(RAIZ, 'manifiesto.json'), 'utf8')) : null;
const hayMarcas = !!manifiesto?.marcas?.fuentes && Object.keys(manifiesto.marcas.fuentes).length > 0;

let s: ServicioCatalogoLocal;
beforeAll(async () => {
  s = crearServicioCatalogo({ cargador: leer, usarWorker: false });
  await s.iniciar();
});

const nombres = async (q: string, n = 5, incluirMarcas = false) =>
  (await s.buscar(q, { limite: n, incluirMarcas })).resultados.map((r) => r.nombre);

describe('normalización', () => {
  it('minúsculas, sin acentos, plurales', () => {
    expect(normalizar('Plátano MACHO, Piña')).toBe('platano macho pina');
    expect(tokenizar('Frijoles de la olla')).toEqual(['frijol', 'olla']);
    expect(raiz('chiles')).toBe(raiz('chile'));
    expect(raiz('nueces')).toBe(raiz('nuez'));
    expect(raiz('tomates')).toBe(raiz('tomate'));
  });
  it('códigos de barras UPC-A / EAN-13 / UPC-E', () => {
    expect(normalizarCodigoBarras('7501020565911')).toBe('7501020565911');
    expect(normalizarCodigoBarras('012000001291')).toBe('0012000001291');
    expect(normalizarCodigoBarras('1234567890123')).toBeNull();
  });
  it('sinónimos: plátano ↔ banana, jitomate ↔ tomate', () => {
    const g = analizarConsulta('plátano');
    expect(g[0].alternativas.map((a) => a.tokens.join(' '))).toContain('banana');
    expect(analizarConsulta('jitomate')[0].alternativas.map((a) => a.tokens.join(' '))).toContain('tomato');
  });
});

describe('catálogo base', () => {
  it('manifiesto con conteos reales', () => {
    const m = s.manifiesto()!;
    expect(m.totalRegistros).toBeGreaterThan(10000);
    expect(m.fuentes.find((f) => f.id === 'usda_sr_legacy')!.registros).toBeGreaterThan(7000);
    expect(m.fuentes.every((f) => f.licencia && f.atribucion)).toBe(true);
  });

  it('"plátano" encuentra la banana cruda (SR 173944)', async () => {
    const r = await s.buscar('plátano', { limite: 5, incluirMarcas: false });
    expect(r.resultados[0].nombre).toMatch(/^Plátano/);
    expect(r.resultados.slice(0, 3).map((x) => x.id)).toContain('usda_sr_legacy:173944');
  });

  it('"banana" también lleva al plátano', async () => {
    expect((await nombres('banana', 5)).some((n) => /plátano/i.test(n))).toBe(true);
  });

  it('"barbacoa" → varias preparaciones', async () => {
    const r = await nombres('barbacoa', 10);
    expect(r.filter((n) => /barbacoa/i.test(n)).length).toBeGreaterThanOrEqual(4);
    expect(r).toContain('Barbacoa de res');
    expect(r).toContain('Barbacoa de borrego');
  });

  it.each([
    ['platno', /plátano/i],
    ['quezo', /^queso/i],
    ['tortila', /^tortilla/i],
    ['jitomat', /^jitomate/i],
    ['chicharo', /chícharo/i],
  ])('tolera errores: "%s"', async (q, re) => {
    const r = await nombres(q, 3);
    expect(r.some((n) => re.test(n))).toBe(true);
  });

  it('platillos mexicanos por receta (tacos al pastor, licuado, agua de jamaica)', async () => {
    const a = await s.buscar('tacos al pastor', { limite: 3, incluirMarcas: false });
    expect(a.resultados[0].id).toBe('caloria_recetas:taco-pastor');
    expect(a.resultados[0].validacion).toBe('receta_estandar');
    const d = await s.obtener('caloria_recetas:taco-pastor');
    expect(d!.notas).toMatch(/valor estimado por receta estandarizada; la preparación real varía/);
    expect(d!.porciones[0].unidad).toBe('pieza');
    expect((await nombres('agua de jamaica', 1))[0]).toBe('Agua de jamaica');
    expect((await nombres('licuado de platano', 1))[0]).toBe('Licuado de plátano');
  });

  it('prefiere el registro oficial cuando existe (chilaquiles, pozole, mole son FNDDS)', async () => {
    const r = await s.buscar('chilaquiles', { limite: 3, incluirMarcas: false });
    expect(r.resultados[0].fuente).toBe('usda_fndds');
  });

  it.each([
    ['usda_sr_legacy:173944', 89, 'Bananas, raw'],
    ['usda_sr_legacy:171287', 143, 'Egg, whole, raw, fresh'],
    ['usda_sr_legacy:168878', 130, 'Rice, white, long-grain, regular, enriched, cooked'],
    ['usda_sr_legacy:171265', 61, 'Milk, whole, 3.25% milkfat, with added vitamin D'],
  ])('referencia verificada %s ≈ %d kcal/100 g', async (id, kcal, original) => {
    const a = await s.obtener(id);
    expect(a).not.toBeNull();
    expect(a!.nombreOriginal).toBe(original);
    expect(a!.nutrientes.kcal).toBeCloseTo(kcal, 0);
    expect(a!.base).toBe('g');
    expect(a!.porciones.length).toBeGreaterThan(0);
  });

  it('faltante ≠ 0 y porciones con unidad casera', async () => {
    const huevo = await s.obtener('usda_sr_legacy:171287');
    expect(huevo!.porciones.some((p) => p.unidad === 'pieza' && /grande/.test(p.etiqueta))).toBe(true);
    const leche = await s.obtener('usda_sr_legacy:171265');
    expect(leche!.porciones.some((p) => p.unidad === 'taza')).toBe(true);
    expect(leche!.densidad).toBeGreaterThan(1);
  });

  it('paginación y búsqueda vacía', async () => {
    const p0 = await s.buscar('leche', { limite: 10, pagina: 0, incluirMarcas: false });
    const p1 = await s.buscar('leche', { limite: 10, pagina: 1, incluirMarcas: false });
    expect(p0.hayMas).toBe(true);
    expect(p1.resultados[0].id).not.toBe(p0.resultados[0].id);
    expect(await s.buscar('   ')).toEqual({ resultados: [], hayMas: false });
  });

  it('AbortSignal cancela la búsqueda', async () => {
    const c = new AbortController();
    c.abort();
    await expect(s.buscar('leche', { senal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('tiempo de búsqueda en memoria < 50 ms', async () => {
    const consultas = ['pollo', 'tortilla de maiz', 'quezo fresco', 'arroz con leche', 'carne asada', 'platno', 'jugo de naranja'];
    const t0 = performance.now();
    for (const q of consultas) await s.buscar(q, { incluirMarcas: false });
    const prom = (performance.now() - t0) / consultas.length;
    console.log(`búsqueda base: ${prom.toFixed(2)} ms promedio`);
    expect(prom).toBeLessThan(50);
  });
});

describe.runIf(hayMarcas)('marcas (fragmentos remotos)', () => {
  it('"leche deslactosada lala" → productos Lala primero', async () => {
    const r = await s.buscar('leche deslactosada lala', { limite: 10 });
    expect(r.resultados.length).toBeGreaterThan(0);
    expect(r.resultados.slice(0, 3).every((x) => /lala/i.test(x.marca ?? ''))).toBe(true);
  });

  it('consulta genérica: genéricos oficiales arriba de las marcas', async () => {
    const r = await s.buscar('leche entera', { limite: 80 });
    expect(['usda_sr_legacy', 'usda_fndds', 'usda_foundation']).toContain(r.resultados[0].fuente);
    const primeraMarca = r.resultados.findIndex((x) => x.fuente === 'usda_branded' || x.fuente === 'off');
    expect(primeraMarca).toBeGreaterThan(3);
  });

  it('código de barras de Open Food Facts México', async () => {
    const a = await s.porCodigoBarras('7501073842007');
    expect(a).not.toBeNull();
    expect(a!.fuente).toBe('off');
    expect(a!.validacion).toBe('comunidad');
  });

  it('código de barras USDA Branded (UPC-A de 12 dígitos)', async () => {
    const dir = await leer('marcas/codigos/_directorio.json');
    const clave = dir.prefijos.find((p: string) => p.startsWith('00'));
    const frag = await leer(`marcas/codigos/${clave}.json`);
    const [gtin, ids] = Object.entries(frag).find(([, v]) => (v as string[]).some((x) => x.startsWith('usda_branded:'))) as [string, string[]];
    const a = await s.porCodigoBarras(gtin.slice(1));
    expect(a).not.toBeNull();
    expect(ids).toContain(a!.id);
    expect(a!.codigoBarras).toBe(gtin);
  });

  it('sin conexión a marcas → parcial: true y resultados base', async () => {
    const offline = crearServicioCatalogo({
      usarWorker: false,
      cargador: async (r) => {
        if (r.startsWith('marcas/')) throw new Error('sin red');
        return leer(r);
      },
    });
    const r = await offline.buscar('leche', { limite: 5 });
    expect(r.parcial).toBe(true);
    expect(r.resultados.length).toBe(5);
  });

  it('tiempo de búsqueda con marcas (archivos locales)', async () => {
    const fresco = crearServicioCatalogo({ cargador: leer, usarWorker: false });
    await fresco.iniciar();
    const consultas = ['coca cola', 'leche deslactosada lala', 'galletas marias', 'yogurt griego', 'tostitos'];
    const t0 = performance.now();
    for (const q of consultas) await fresco.buscar(q);
    const prom = (performance.now() - t0) / consultas.length;
    console.log(`búsqueda con marcas (en frío, disco local): ${prom.toFixed(1)} ms promedio`);
    expect(prom).toBeLessThan(1500);
  });
});
