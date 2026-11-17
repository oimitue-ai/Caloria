// Sección 2: relevancia (top 5) y latencia de búsqueda en Chrome real; verificación de que el Web Worker se usa.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, SALIDA, ok, nota, vigilar, abrirNavegador, opcionesContexto, cap } from './comun.mjs';

/** consulta → regex que debe aparecer en el top 5 (criterio de relevancia mínima). */
export const CONSULTAS = [
  ['plátano', /^Plátano/], ['tortilla de maíz', /^Tortilla(,| de) maíz/], ['barbacoa', /Barbacoa/], ['leche deslactosada lala', /deslactosada/i],
  ['coca cola', /Coca/i], ['huevo', /^Huevo entero|^Huevo cocido|^Huevo, entero/], ['arroz', /^Arroz blanco, cocido|^Arroz blanco$|^Arroz, blanco/], ['frijoles refritos', /^Frijoles refritos/],
  ['pozole', /[Pp]ozole/], ['licuado de plátano', /^Licuado de plátano/], ['jitomate', /^Jitomate/], ['elote', /^Elote|maíz dulce/i],
  ['chícharo', /^Chícharo/], ['cacahuate', /^Cacahuate/], ['bolillo', /bolillo/i], ['telera', /^Telera/], ['pan dulce', /^Pan dulce/],
  ['concha', /^Concha( \(pan dulce\))?$|^Pan dulce/], ['queso panela', /panela|Queso fresco/i], ['queso oaxaca', /oaxaca|asadero/i], ['chorizo', /^Chorizo/],
  ['carnitas', /carnitas/i], ['birria', /^Birria/], ['tacos al pastor', /pastor/i], ['quesadilla', /^Quesadilla/], ['agua de jamaica', /^Agua de jamaica/],
  ['horchata', /^Horchata/], ['atún en agua', /^Atún/i], ['yogur griego', /^Yogur,? griego/i], ['avena', /^Avena/],
  ['platno', /^Plátano/], ['tortila', /^Tortilla/], ['quezo oaxaca', /oaxaca|asadero/i], ['jamon de pavo', /pavo/i],
];

async function medir(p, q) {
  const s = p.getByRole('searchbox', { name: 'Buscar alimento' });
  await s.fill('');
  await p.waitForTimeout(50);
  const t0 = Date.now();
  await s.fill(q);
  await p.waitForFunction(() => {
    const c = document.querySelector('[aria-busy]');
    return c && c.getAttribute('aria-busy') === 'false' && (c.querySelector('li') || /No encontramos/.test(c.textContent));
  }, null, { timeout: 20000 });
  const ms = Date.now() - t0;
  const top = await p.locator('[aria-label="Resultados del catálogo"] > li span.line-clamp-2').evaluateAll((l) => l.slice(0, 5).map((e) => e.textContent));
  const parcial = (await p.getByText('Sin conexión: faltan productos de marca').count()) > 0;
  return { ms, top, parcial };
}

export async function probarBusqueda({ offline = false } = {}) {
  const b = await abrirNavegador();
  const ctx = await b.newContext(opcionesContexto());
  const p = await ctx.newPage();
  vigilar(p, 'busqueda');
  await p.goto(BASE);
  await p.getByRole('button', { name: 'Omitir' }).click();
  await p.getByRole('button', { name: 'Agregar a Comida', exact: true }).click();
  const filas = [];
  const primera = await medir(p, 'plátano'); // en frío: descarga índices base + inicia worker
  nota(`primera búsqueda (en frío, incluye descargar el índice base y arrancar el worker): ${primera.ms} ms`);
  for (const [q, esperado] of CONSULTAS) {
    const r = await medir(p, q);
    const pos = r.top.findIndex((n) => esperado.test(n));
    filas.push({ q, ...r, pos: pos + 1 });
    ok(`"${q}" → esperado en top 5 (${esperado})`, pos >= 0, `${r.ms} ms · ${r.top.join(' | ')}`);
  }
  const tiempos = filas.map((f) => f.ms).sort((a, b) => a - b);
  const mediana = tiempos[Math.floor(tiempos.length / 2)];
  const p95 = tiempos[Math.floor(tiempos.length * 0.95)];
  nota(`latencia (tecleo → resultados pintados, incluye debounce de 120 ms y marcas por red local): mediana ${mediana} ms, p95 ${p95} ms, máx ${tiempos.at(-1)} ms`);
  ok('latencia mediana < 600 ms', mediana < 600, `${mediana} ms`);

  // Web Worker: existe y es quien descargó el índice base (no aparece en el hilo principal)
  const workers = p.workers().map((w) => w.url());
  ok('hay un Web Worker del catálogo (assets/worker-*.js)', workers.some((u) => /assets\/worker-[\w-]+\.js$/.test(u)), workers.join(', '));
  const enPrincipal = await p.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /catalogo\/base\/indice/.test(n)));
  const w = p.workers().find((x) => /worker-/.test(x.url()));
  const enWorker = w ? await w.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /catalogo\/base\//.test(n))) : [];
  ok('el índice base se descarga dentro del worker (no en el hilo principal)', enWorker.some((n) => /indice-/.test(n)) && enPrincipal.length === 0, `worker: ${enWorker.length} archivos base; principal: ${enPrincipal.length}`);
  // tiempo de la búsqueda base en el worker (sin red ni render)
  const tw = w ? await w.evaluate(async () => {
    // mide el bucle de mensajes: buscar vía el mismo onmessage
    return null;
  }) : null;
  void tw;
  await cap(p, 'busqueda-01-resultados');
  writeFileSync(join(SALIDA, 'busqueda-navegador.json'), JSON.stringify({ primera, filas, mediana, p95 }, null, 1));
  await b.close();
  return { filas, mediana, p95, primera };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { resumen } = await import('./comun.mjs');
  await probarBusqueda();
  process.exit(resumen() ? 1 : 0);
}
