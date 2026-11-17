// Sección 7: PWA — manifest, íconos, service worker, instalabilidad (CDP), precache y uso sin conexión.
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, RAIZ, ok, nota, cap, vigilar, abrirNavegador, abrirPersistente, opcionesContexto } from './comun.mjs';

const DIST = join(RAIZ, 'dist');
const tamPNG = (ruta) => { const b = readFileSync(ruta); return b.toString('ascii', 1, 4) === 'PNG' ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : 'no-png'; };

async function buscarOffline(p, q) {
  const s = p.getByRole('searchbox', { name: 'Buscar alimento' });
  await s.fill(q);
  await p.waitForFunction(() => { const c = document.querySelector('[aria-busy]'); return c && c.getAttribute('aria-busy') === 'false'; }, null, { timeout: 15000 });
  await p.waitForTimeout(200);
  return {
    nombres: await p.locator('[aria-label="Resultados del catálogo"] > li span.line-clamp-2').evaluateAll((l) => l.slice(0, 5).map((e) => e.textContent)),
    aviso: (await p.getByText(/Sin conexión: faltan productos de marca|El catálogo no está disponible/).count()) > 0,
  };
}

export async function probarPWA() {
  // ── Manifest e íconos (archivo publicado) ──
  const m = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'));
  ok('manifest: campos requeridos', m.name && m.short_name && m.start_url && m.display === 'standalone' && m.lang === 'es-MX' && m.theme_color && m.background_color && m.scope, JSON.stringify({ name: m.name, start_url: m.start_url, scope: m.scope, display: m.display, id: m.id }));
  for (const i of m.icons) {
    const ruta = join(DIST, i.src);
    const existe = existsSync(ruta);
    const real = existe && i.src.endsWith('.png') ? tamPNG(ruta) : i.sizes;
    ok(`ícono ${i.src} existe y mide ${i.sizes} (${i.purpose})`, existe && (i.sizes === 'any' || real === i.sizes), `real ${real}`);
  }
  ok('manifest: ícono maskable 512 y "any" 192/512', m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512') && ['192x192', '512x512'].every((s) => m.icons.some((i) => i.sizes === s && i.purpose === 'any')));
  for (const s of m.shortcuts ?? []) ok(`atajo "${s.name}" con ícono existente`, s.icons.every((i) => existsSync(join(DIST, i.src))));

  // ── Precache (sw.js) ──
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((x) => x[1]);
  const unicas = [...new Set(urls)];
  const bytes = unicas.reduce((s, u) => s + (existsSync(join(DIST, u)) ? statSync(join(DIST, u)).size : 0), 0);
  ok('precache sin catalogo/ (ni marcas ni base)', !unicas.some((u) => /^catalogo\//.test(u)), `${unicas.length} URL únicas`);
  nota(`precache: ${urls.length} entradas (${unicas.length} únicas), ${(bytes / 1024).toFixed(0)} KiB sin comprimir; mayor: ${unicas.map((u) => [u, statSync(join(DIST, u)).size]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([u, s]) => `${u} ${(s / 1024).toFixed(0)} KiB`).join(', ')}`);
  ok('precache < 3 MiB', bytes < 3 * 1024 * 1024, `${(bytes / 1048576).toFixed(2)} MiB`);

  // ── Navegador: SW, instalabilidad, offline ──
  // perfil persistente: Chrome no permite instalar desde incógnito (newContext = incógnito)
  const ctx = await abrirPersistente('/tmp/caloria-auditoria/perfil-pwa', undefined, true);
  const b = { close: () => ctx.close() };
  const p = ctx.pages()[0] ?? await ctx.newPage();
  vigilar(p, 'pwa');
  const cdp = await ctx.newCDPSession(p);
  await p.goto(BASE);
  await p.getByRole('button', { name: 'Omitir' }).click();
  await p.evaluate(() => navigator.serviceWorker.ready);
  const am = await cdp.send('Page.getAppManifest');
  ok('CDP getAppManifest sin errores', am.errors.length === 0, JSON.stringify(am.errors));
  const inst = await cdp.send('Page.getInstallabilityErrors');
  ok('CDP getInstallabilityErrors: instalable', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
  await p.reload();
  await p.waitForTimeout(800);
  ok('el service worker controla la página', await p.evaluate(() => !!navigator.serviceWorker.controller));
  // Primera carga en línea: una búsqueda y abrir un alimento (lo que haría un usuario normal)
  await p.getByRole('button', { name: 'Agregar a Desayuno', exact: true }).click();
  const enLinea = await buscarOffline(p, 'plátano');
  ok('en línea: búsqueda funciona', enLinea.nombres.length > 0, enLinea.nombres.join(' | '));
  // la app precarga el catálogo base en segundo plano (≈4 s tras abrir); se espera a que termine
  const t0 = Date.now();
  let detalles = 0;
  while (Date.now() - t0 < 30000) {
    detalles = await p.evaluate(async () => { let n = 0; for (const k of await caches.keys()) if (/^caloria-catalogo-\d/.test(k)) n += (await (await caches.open(k)).keys()).filter((r) => /base\/detalle-/.test(r.url)).length; return n; });
    if (detalles >= 12) break;
    await p.waitForTimeout(500);
  }
  ok('precarga en segundo plano del catálogo base (12 detalles en Cache Storage)', detalles >= 12, `${detalles} en ${Date.now() - t0} ms`);
  const cachesEnLinea = await p.evaluate(async () => Promise.all((await caches.keys()).map(async (k) => [k, (await (await caches.open(k)).keys()).length])));
  nota(`Cache Storage tras primera carga: ${cachesEnLinea.map(([k, n]) => `${k}=${n}`).join(', ')}`);
  await p.keyboard.press('Escape');

  // ── Sin conexión ──
  await ctx.setOffline(true);
  await p.reload();
  const abre = await p.getByText('Consumidas').first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  ok('sin conexión: la app abre (shell precacheado)', abre);
  await p.getByRole('button', { name: 'Agregar a Desayuno', exact: true }).click();
  const off1 = await buscarOffline(p, 'frijoles refritos');
  ok('sin conexión: el catálogo base busca (genéricos y mexicanos)', off1.nombres.some((n) => /^Frijoles refritos/.test(n)), off1.nombres.join(' | '));
  ok('sin conexión: aviso de marcas faltantes', off1.aviso);
  await cap(p, 'pwa-01-offline-busqueda');
  const off2 = await buscarOffline(p, 'coca cola');
  ok('sin conexión: "coca cola" degrada a genéricos con aviso', off2.aviso, off2.nombres.join(' | '));
  // abrir un alimento base que NO se abrió en línea
  await buscarOffline(p, 'frijoles refritos');
  await p.locator('[aria-label="Resultados del catálogo"] > li button').first().click();
  const abrio = await p.getByRole('dialog').getByText('Vas a agregar').waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  const errorTxt = abrio ? '' : await p.getByRole('dialog').innerText().catch(() => '');
  ok('sin conexión: se puede abrir y registrar un alimento base no usado antes', abrio, abrio ? '' : errorTxt.replace(/\s+/g, ' ').slice(0, 160));
  await cap(p, 'pwa-02-offline-detalle');
  if (abrio) {
    await p.getByRole('dialog').getByRole('button', { name: 'Agregar a Desayuno' }).click();
    ok('sin conexión: registro guardado', await p.getByText(/Agregado a /).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false));
  }
  await p.keyboard.press('Escape');
  // código de barras sin conexión
  await ctx.setOffline(false);
  await b.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { resumen } = await import('./comun.mjs');
  await probarPWA();
  process.exit(resumen() ? 1 : 0);
}
