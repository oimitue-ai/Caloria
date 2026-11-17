/**
 * Validación del pipeline y de su salida (proyecto "nucleo" de Vitest, entorno Node).
 *   npx vitest run datos
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { validar } from './validar.ts';
import { traducirNombre } from './traducir.ts';
import { construirPorciones, densidadDeTexto } from './porciones.ts';
import { leerCsv, unzipStream, CATALOGO, CRUDOS, INTERMEDIO, RAIZ_DATOS } from './util.ts';
import { esCodigoMexicano, esMexicanoPorTexto } from './mexicano.ts';

describe('validación', () => {
  it('descarta sin nombre, sin kcal e imposibles; marca atípicos sin borrar', () => {
    expect(validar({ nombre: '', nutrientes: { kcal: 10 } }).motivo).toBe('sin_nombre');
    expect(validar({ nombre: 'x', nutrientes: {} }).motivo).toBe('sin_kcal');
    expect(validar({ nombre: 'x', nutrientes: { kcal: 1200 } }).motivo).toBe('kcal_imposible');
    expect(validar({ nombre: 'x', nutrientes: { kcal: 300, proteina: 60, carbohidratos: 60, grasa: 0 } }).motivo).toBe('suma_macros_mayor_100');
    const r = validar({ nombre: 'x', nutrientes: { kcal: 500, proteina: 1, carbohidratos: 1, grasa: 1 } });
    expect(r.ok).toBe(true);
    expect(r.atipico).toBe(true);
    expect(validar({ nombre: 'Plátano', nutrientes: { kcal: 89, proteina: 1.09, carbohidratos: 22.8, grasa: 0.33, fibra: 2.6 } }).atipico).toBe(false);
  });
});

describe('traducción y porciones', () => {
  it.each([
    ['Bananas, raw', 'Plátano, crudo'],
    ['Taco, corn tortilla, beef, cheese', 'Taco, tortilla de maíz, carne de res, queso'],
    ['Beans, pinto, mature seeds, cooked, boiled, without salt', 'Frijol, pinto, grano maduro, cocido, hervido, sin sal'],
    ['Orange juice, raw', 'Jugo de naranja, crudo'],
  ])('%s → %s', (en, es) => expect(traducirNombre(en).nombre).toBe(es));

  it('porciones caseras con unidad y equivalencia por unidad', () => {
    const p = construirPorciones([{ texto: '1 cup, chopped', gramos: 150 }, { texto: '1 large', gramos: 50 }, { texto: '2 tbsp', gramos: 30 }], 'g');
    expect(p.find((x) => x.unidad === 'taza')!.equivalencia).toBe(150);
    expect(p.find((x) => x.unidad === 'cucharada')!.equivalencia).toBe(15);
    expect(p.find((x) => x.unidad === 'pieza')!.etiqueta).toBe('1 pieza grande (50 g)');
    expect(p.filter((x) => x.predeterminada)).toHaveLength(1);
  });

  it('la porción predeterminada no nombra otro platillo (tortilla ≠ "1 enchilada")', () => {
    const tortilla = construirPorciones(
      [{ texto: '1 enchilada', gramos: 19 }, { texto: '1 tortilla', gramos: 24 }, { texto: '1 taco', gramos: 19 }],
      'g',
      'Tortillas, ready-to-bake or -fry, corn',
    );
    expect(tortilla.find((x) => x.predeterminada)!.etiqueta).toBe('1 tortilla (24 g)');
    // si el alimento SÍ es ese platillo, su pieza se conserva
    const taco = construirPorciones([{ texto: '1 taco', gramos: 80 }], 'g', 'Taco, corn tortilla, beef');
    expect(taco.find((x) => x.predeterminada)!.etiqueta).toBe('1 taco (80 g)');
  });

  it('densidad solo de medidas líquidas explícitas', () => {
    expect(densidadDeTexto('1 fl oz', 30.5)).toBeCloseTo(1.031, 2);
    expect(densidadDeTexto('1 cup', 240)).toBeUndefined();
  });

  it('mexicano por palabras clave y prefijo GS1 750', () => {
    expect(esMexicanoPorTexto('Soup, pozole')).toBe(true);
    expect(esMexicanoPorTexto('Bananas, raw')).toBe(false);
    expect(esCodigoMexicano('7501020565911')).toBe(true);
    expect(esCodigoMexicano('0012000001291')).toBe(false);
  });

  it('CSV en streaming con comillas partidas entre trozos', async () => {
    const txt = 'a,b,c\n"x ""q""",2,"multi\nline"\n"",,"z"\n';
    for (const n of [1, 2, 3, 7]) {
      const trozos: string[] = [];
      for (let i = 0; i < txt.length; i += n) trozos.push(txt.slice(i, i + n));
      const filas = [];
      for await (const f of leerCsv(Readable.from(trozos))) filas.push(f);
      expect(filas).toEqual([{ a: 'x "q"', b: '2', c: 'multi\nline' }, { a: '', b: '', c: 'z' }]);
    }
  });
});

const hayCatalogo = existsSync(join(CATALOGO, 'manifiesto.json'));

describe.runIf(hayCatalogo)('salida publicada', () => {
  const man = hayCatalogo ? JSON.parse(readFileSync(join(CATALOGO, 'manifiesto.json'), 'utf8')) : null;

  it('límites: < 600 MB, < 20 000 archivos, ninguno > 20 MB; base ≤ 1.5 MB por archivo', () => {
    let n = 0;
    let bytes = 0;
    let mayor = 0;
    let mayorBase = 0;
    const rec = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) rec(p);
        else {
          const s = statSync(p).size;
          n++;
          bytes += s;
          mayor = Math.max(mayor, s);
          if (p.includes('/base/')) mayorBase = Math.max(mayorBase, s);
        }
      }
    };
    rec(CATALOGO);
    expect(bytes).toBeLessThan(600e6);
    expect(n).toBeLessThan(20000);
    expect(mayor).toBeLessThan(20e6);
    expect(mayorBase).toBeLessThan(1.5e6);
  });

  it('conteos del manifiesto = registros reales en los intermedios', () => {
    for (const f of man.fuentes) {
      const ruta = join(INTERMEDIO, `${f.id}.ndjson`);
      if (!existsSync(ruta)) continue;
      const lineas = readFileSync(ruta, 'utf8').split('\n').filter(Boolean).length;
      expect(f.registros, f.id).toBe(lineas);
    }
    expect(man.totalRegistros).toBe(man.fuentes.reduce((s: number, f: { registros: number }) => s + f.registros, 0));
  });

  it('recetas: los valores se recalculan igual desde sus ingredientes', () => {
    const recetas = readFileSync(join(INTERMEDIO, 'caloria_recetas.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const proc = readFileSync(join(RAIZ_DATOS, 'salida', 'procedencia', 'caloria_recetas.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const sr = new Map<string, any>();
    for (const f of ['usda_sr_legacy', 'usda_fndds']) for (const l of readFileSync(join(INTERMEDIO, `${f}.ndjson`), 'utf8').split('\n')) if (l) { const a = JSON.parse(l); sr.set(a.id, a); }
    for (const r of recetas) sr.set(r.id, r);
    const tacos = recetas.find((r: any) => r.id === 'caloria_recetas:taco-pastor');
    const p = proc.find((x: any) => x.id === tacos.id);
    const kcal = p.ingredientes.reduce((s: number, i: any) => s + (sr.get(i.id).nutrientes.kcal * i.g) / 100, 0) / p.pesoFinalG * 100;
    expect(tacos.nutrientes.kcal).toBeCloseTo(kcal, 0);
    expect(recetas.length).toBeGreaterThanOrEqual(40);
  });

  const zipSr = existsSync(join(CRUDOS, 'usda')) ? readdirSync(join(CRUDOS, 'usda')).find((f) => /sr_legacy_food_json/.test(f)) : undefined;
  it.runIf(!!zipSr)('referencias contra el JSON oficial de SR Legacy (plátano 89, huevo 143, arroz 130, leche 61)', async () => {
    const buscados = new Map([[173944, 89], [171287, 143], [168878, 130], [171265, 61]]);
    const encontrados = new Map<number, number>();
    let texto = '';
    for await (const t of unzipStream(join(CRUDOS, 'usda', zipSr!), 'FoodData_Central_sr_legacy_food_json_2018-04.json')) texto += t;
    for (const l of texto.split('\n')) {
      if (![...buscados.keys()].some((id) => l.includes(`"fdcId":${id},`) || l.includes(`"fdcId":${id}}`))) continue;
      const t = l.replace(/,\s*$/, '');
      let o: any;
      try {
        o = JSON.parse(t);
      } catch {
        o = JSON.parse(t.replace(/\]\}\s*$/, '')); // última línea: cierra el arreglo raíz
      }
      if (!buscados.has(o.fdcId)) continue;
      encontrados.set(o.fdcId, o.foodNutrients.find((n: any) => n.nutrient.id === 1008).amount);
    }
    const catalogo = new Map<string, any>();
    for (const f of readdirSync(join(CATALOGO, 'base')).filter((x) => x.startsWith('detalle')))
      for (const [k, v] of Object.entries(JSON.parse(readFileSync(join(CATALOGO, 'base', f), 'utf8')))) catalogo.set(k, v);
    for (const [id, kcal] of buscados) {
      expect(encontrados.get(id), `oficial ${id}`).toBeCloseTo(kcal, 0);
      expect(catalogo.get(`usda_sr_legacy:${id}`).nutrientes.kcal, `catálogo ${id}`).toBe(encontrados.get(id));
    }
  }, 60_000);
});
