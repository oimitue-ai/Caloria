/** Relevancia de búsqueda (top 5) para consultas mexicanas comunes. Uso: npx tsx pruebas/herramientas/relevancia.ts [--marcas] */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearServicioCatalogo } from '../../src/catalogo/index.ts';

const RAIZ = join(process.cwd(), 'public', 'catalogo');
const leer = async (r: string) => { const p = join(RAIZ, r); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
const marcas = process.argv.includes('--marcas');
const consultas = process.argv.filter((a) => !a.startsWith('--')).slice(2);
const Q = consultas.length ? consultas : [
  'plátano', 'tortilla de maíz', 'barbacoa', 'leche deslactosada lala', 'coca cola', 'huevo', 'arroz', 'frijoles refritos',
  'pozole', 'licuado de plátano', 'jitomate', 'elote', 'chícharo', 'cacahuate', 'bolillo', 'telera', 'pan dulce', 'concha',
  'queso panela', 'queso oaxaca', 'chorizo', 'carnitas', 'birria', 'tacos al pastor', 'quesadilla', 'agua de jamaica',
  'horchata', 'atún en agua', 'yogur griego', 'avena', 'platno', 'tortila', 'quezo', 'aguacate', 'nopal', 'tamal', 'chilaquiles',
  'jamon', 'salchicha', 'mango', 'papaya', 'frijol', 'pechuga de pollo', 'carne molida', 'manzana', 'tortilla de harina',
];
const s = crearServicioCatalogo({ cargador: leer, usarWorker: false });
await s.iniciar();
for (const q of Q) {
  const t0 = performance.now();
  const r = await s.buscar(q, { limite: 5, incluirMarcas: marcas });
  const ms = (performance.now() - t0).toFixed(1);
  console.log(`\n## ${q}  (${ms} ms)`);
  for (const x of r.resultados) console.log(`  ${x.puntuacion.toFixed(2)}  ${x.nombre}${x.marca ? ' [' + x.marca + ']' : ''}  | ${x.fuente} | ${x.kcal ?? '—'} kcal | ${x.nombreOriginal ?? ''}`);
}
