// Prueba E2E de la interfaz de CALORÍA con Chrome real (datos de prueba SOLO aquí).
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const CAP = '/home/claude/caloria/pruebas/capturas';
const resultados = [];
const errores = [];
const ok = (nombre, cond, extra = '') => { resultados.push({ nombre, ok: !!cond, extra }); console.log(`${cond ? 'OK  ' : 'FALLA'} ${nombre} ${extra}`); };

const navegador = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

function vigilar(p) {
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });
}

async function cap(p, nombre) { await p.waitForTimeout(350); await p.screenshot({ path: `${CAP}/${nombre}.png` }); }

/** Siembra registros y pesos de días anteriores directamente en IndexedDB (solo prueba). */
async function sembrar(p) {
  await p.evaluate(async () => {
    const abrir = () => new Promise((res, rej) => { const r = indexedDB.open('caloria'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const db = await abrir();
    const tx = db.transaction(['registros', 'pesos'], 'readwrite');
    const hoy = new Date();
    const f = (d) => { const x = new Date(hoy); x.setDate(x.getDate() - d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const inst = { nombre: 'Comida de prueba', fuente: 'usuario', base: 'g', nutrientes: { kcal: 200, proteina: 10, carbohidratos: 25, grasa: 7 }, porciones: [] };
    const iso = new Date().toISOString();
    for (let d = 1; d <= 40; d++) {
      if (d % 6 === 0) continue; // días sin registro
      const gramos = 800 + ((d * 137) % 450);
      const k = gramos / 100;
      tx.objectStore('registros').put({
        id: `prueba-${d}`, fecha: f(d), comida: 'comida', alimentoId: 'usuario:prueba', instantanea: inst,
        cantidad: gramos, unidad: 'g', cantidadBase: gramos,
        totales: { kcal: 200 * k, proteina: 10 * k, carbohidratos: 25 * k, grasa: 7 * k }, creado: iso, modificado: iso,
      });
      if (d % 2 === 0) tx.objectStore('pesos').put({ id: `peso-${d}`, fecha: f(d), pesoKg: 82 - (40 - d) * -0.06 + Math.sin(d) * 0.4 });
    }
    await new Promise((res) => { tx.oncomplete = res; });
    db.close();
  });
}

// ───────────── Móvil ─────────────
const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
const p = await ctx.newPage();
vigilar(p);
await p.goto(BASE);
await p.waitForURL(/#\/bienvenida/, { timeout: 10000 }).catch(() => {});
ok('primer arranque abre el asistente', p.url().includes('#/bienvenida'), p.url());
await cap(p, 'movil-01-bienvenida');

await p.getByRole('button', { name: 'Configurar mi meta' }).click();
await p.getByRole('radio', { name: 'Hombre' }).click();
await p.getByLabel('Edad').fill('34');
await p.getByLabel('Estatura').fill('172');
await p.getByLabel('Peso actual').fill('82');
await p.getByLabel('Peso objetivo').fill('76');
await cap(p, 'movil-02-asistente-datos');
await p.getByRole('button', { name: 'Continuar' }).click();
await p.getByLabel('Nivel de actividad').selectOption('moderado');
await p.getByRole('radio', { name: 'Bajar' }).click();
await p.getByRole('button', { name: 'Continuar' }).click();
await cap(p, 'movil-03-asistente-propuesta');
const kcalPropuesta = await p.locator('text=/\\d[\\d,]* kcal/').first().textContent();
ok('el asistente muestra una propuesta del motor', /kcal/.test(kcalPropuesta ?? ''), kcalPropuesta ?? '');
await p.getByRole('button', { name: 'Guardar y empezar' }).click();
await p.waitForURL(/#\/$/);
await p.getByText('kcal restantes').waitFor();
ok('panel Hoy con meta tras el asistente', await p.getByText('kcal restantes').isVisible());
await cap(p, 'movil-04-hoy-vacio');

// Alimento propio (dato de prueba) creado desde la interfaz
await p.goto(`${BASE}#/mas/alimentos/nuevo`);
await p.getByLabel('Nombre', { exact: true }).fill('Tortilla de maíz prueba');
await p.getByRole('button', { name: 'Agregar' }).click();
await p.getByLabel('Nombre', { exact: true }).nth(1).fill('1 pieza');
await p.getByLabel('Equivale a').fill('30');
await p.getByLabel('Calorías').fill('218');
await p.getByLabel('Proteína').fill('5.7');
await p.getByLabel('Carbohidratos').fill('44.6');
await p.getByLabel('Grasa', { exact: true }).fill('2.9');
await cap(p, 'movil-05-nuevo-alimento');
await p.getByRole('button', { name: 'Crear alimento' }).click();
await p.waitForURL(/#\/mas\/alimentos$/);
ok('alimento propio creado', await p.getByText('Tortilla de maíz prueba').waitFor().then(() => true));

// Registrar en Desayuno
await p.goto(`${BASE}#/`);
await p.getByRole('button', { name: 'Agregar a Desayuno' }).click();
const buscador = p.getByRole('searchbox', { name: 'Buscar alimento' });
await buscador.waitFor();
const enfocado = await buscador.evaluate((el) => document.activeElement === el);
ok('el buscador recibe el foco automáticamente', enfocado);
await cap(p, 'movil-06-hoja-registro-vacia');
const t0 = Date.now();
await buscador.fill('tortilla');
await p.getByRole('button', { name: /Tortilla de maíz prueba/ }).first().waitFor({ timeout: 5000 });
ok('resultados al teclear', true, `${Date.now() - t0} ms`);
await cap(p, 'movil-07-resultados');
await p.getByRole('button', { name: /Tortilla de maíz prueba/ }).first().click();
await p.getByRole('dialog').getByRole('button', { name: '2', exact: true }).click();
const vista = await p.locator('[aria-live="polite"]').filter({ hasText: 'Vas a agregar' }).textContent();
ok('vista previa en vivo (2 piezas = 131 kcal)', /131/.test(vista ?? ''), vista?.replace(/\s+/g, ' ').slice(0, 80));
const opciones = await p.getByLabel('Unidad').locator('option').allTextContents();
ok('unidades solo convertibles (sin ml para alimento en g sin densidad)', !opciones.some((o) => /mililitro|taza/i.test(o)), opciones.join(' | '));
await cap(p, 'movil-08-panel-cantidad');
await p.getByRole('dialog').getByRole('button', { name: 'Agregar a Desayuno' }).click();
await p.getByText(/Agregado a Desayuno/).waitFor();
ok('aviso "Agregado" con Deshacer', await p.getByRole('button', { name: 'Deshacer' }).isVisible());
ok('la hoja sigue abierta para agregar más', await buscador.isVisible());
await cap(p, 'movil-09-agregado');
// Agregar de un toque desde Recientes
await p.getByRole('button', { name: /Agregar Tortilla de maíz prueba, 2/ }).click();
await p.waitForTimeout(300);
ok('agregar de un toque desde recientes', (await p.getByText(/2 alimentos agregados/).count()) > 0);
await p.getByRole('dialog').getByRole('button', { name: 'Listo' }).click();
await p.waitForTimeout(300);
const filas = p.getByRole('button', { name: /Tortilla de maíz prueba, 2 × 1 pieza/ });
ok('dos registros en el día', (await filas.count()) === 2, String(await filas.count()));
await cap(p, 'movil-10-hoy-con-registros');

// Editar cantidad
await filas.first().click();
await p.getByRole('dialog').getByLabel('Cantidad', { exact: true }).fill('3');
await p.getByRole('dialog').getByRole('button', { name: 'Guardar cambios' }).click();
await p.getByText('Cambios guardados').waitFor();
ok('editar cantidad', (await p.getByRole('button', { name: /3 × 1 pieza.*196 kcal/ }).count()) === 1);

// Eliminar + deshacer + eliminar
await p.getByRole('button', { name: /3 × 1 pieza/ }).click();
await p.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
await p.getByText(/Eliminado de Desayuno/).waitFor();
ok('eliminar', (await p.getByRole('button', { name: /3 × 1 pieza/ }).count()) === 0);
await p.getByRole('button', { name: 'Deshacer' }).click();
await p.waitForTimeout(300);
ok('deshacer eliminación', (await p.getByRole('button', { name: /3 × 1 pieza/ }).count()) === 1);
await cap(p, 'movil-11-hoy-editado');

// Sembrar historial y recorrer pantallas
await sembrar(p);
await p.getByLabel('Día anterior').click();
await cap(p, 'movil-12-ayer');
for (const [ruta, nombre, texto] of [
  ['#/calendario', 'movil-13-calendario', 'Resumen del mes'],
  ['#/peso', 'movil-14-peso', 'Registrar peso'],
  ['#/estadisticas', 'movil-15-estadisticas', 'Calorías y meta'],
  ['#/mas', 'movil-16-mas', 'Perfil y metas'],
  ['#/mas/perfil', 'movil-17-perfil', 'Tu meta diaria'],
  ['#/mas/recetas', 'movil-18-recetas', 'Crea tu primera receta'],
  ['#/mas/alimentos', 'movil-19-mis-alimentos', 'Tortilla de maíz prueba'],
  ['#/mas/respaldo', 'movil-20-respaldo', 'Tus datos viven en este dispositivo'],
  ['#/mas/fuentes', 'movil-21-fuentes', 'Qué significan las insignias'],
  ['#/mas/acerca', 'movil-22-acerca', 'Privacidad'],
]) {
  await p.goto(`${BASE}${ruta}`);
  const visible = await p.getByText(texto).first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  ok(`pantalla ${ruta}`, visible);
  await cap(p, nombre);
}
// Respaldo JSON real (descarga)
await p.goto(`${BASE}#/mas/respaldo`);
const [descarga] = await Promise.all([
  p.waitForEvent('download', { timeout: 10000 }),
  p.getByRole('button', { name: /Respaldo completo \(JSON\)/ }).click(),
]);
ok('exportar respaldo JSON', /caloria-respaldo-\d{4}-\d{2}-\d{2}\.json/.test(descarga.suggestedFilename()), descarga.suggestedFilename());
const [xlsx] = await Promise.all([
  p.waitForEvent('download', { timeout: 15000 }),
  p.getByRole('button', { name: /Excel/ }).click(),
]);
ok('exportar Excel', xlsx.suggestedFilename().endsWith('.xlsx'), xlsx.suggestedFilename());
// Código de barras: entrada manual (sin BarcodeDetector en escritorio headless)
await p.goto(`${BASE}#/`);
await p.getByRole('button', { name: 'Agregar a Cena' }).click();
await p.getByRole('dialog').getByRole('button', { name: 'Buscar por código de barras' }).click();
await p.getByRole('dialog').getByLabel('Código de barras').fill('7501234567890');
await p.getByRole('dialog').getByRole('button', { name: 'Buscar', exact: true }).click();
ok('código no encontrado ofrece crear alimento', await p.getByRole('dialog').getByText('Crear este alimento').waitFor({ timeout: 8000 }).then(() => true).catch(() => false));
await cap(p, 'movil-32-codigo-barras');
await p.keyboard.press('Escape');
// Peso: alta rápida
await p.goto(`${BASE}#/peso`);
await p.getByLabel('Peso', { exact: true }).fill('81.6');
await p.getByRole('button', { name: /Guardar peso|Reemplazar peso/ }).click();
await p.getByText(/Peso guardado/).waitFor();
ok('registrar peso', true);
await p.evaluate(() => window.scrollTo(0, 600));
await cap(p, 'movil-23-peso-grafica');
await p.goto(`${BASE}#/estadisticas`);
await p.getByText('Calorías y meta').waitFor();
await p.evaluate(() => window.scrollTo(0, 700));
await cap(p, 'movil-24-estadisticas-graficas');
// Receta
await p.goto(`${BASE}#/mas/recetas/nueva`);
await p.getByLabel('Nombre').fill('Tacos de prueba');
await p.getByRole('button', { name: 'Agregar' }).click();
await p.getByRole('searchbox', { name: 'Buscar ingrediente' }).fill('tortilla');
await p.getByRole('dialog').getByRole('button', { name: /Tortilla de maíz prueba/ }).first().click();
await p.getByRole('dialog').getByRole('button', { name: 'Agregar a la receta' }).click();
await p.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
await cap(p, 'movil-25-receta');
await p.getByRole('button', { name: 'Crear receta' }).click();
await p.waitForURL(/#\/mas\/recetas\/[0-9a-f-]{36}$/);
ok('receta creada', true);

// Modo oscuro
await p.goto(`${BASE}#/mas`);
await p.getByRole('radio', { name: 'Oscuro' }).click();
ok('modo oscuro activo', await p.evaluate(() => document.documentElement.classList.contains('dark')));
await cap(p, 'movil-26-mas-oscuro');
await p.goto(`${BASE}#/`);
await p.getByText('kcal restantes').waitFor();
await cap(p, 'movil-27-hoy-oscuro');
await p.getByRole('button', { name: 'Registrar comida' }).click();
await p.getByRole('searchbox', { name: 'Buscar alimento' }).waitFor();
await cap(p, 'movil-28-hoja-oscuro');
await p.keyboard.press('Escape');
await p.goto(`${BASE}#/estadisticas`);
await p.getByText('Calorías y meta').waitFor();
await p.evaluate(() => window.scrollTo(0, 700));
await cap(p, 'movil-29-estadisticas-oscuro');
await p.goto(`${BASE}#/calendario`);
await p.getByText('Resumen del mes').waitFor();
await cap(p, 'movil-30-calendario-oscuro');

// PWA: manifest y service worker
const manifiesto = await p.evaluate(async () => {
  const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
  if (!href) return null;
  const r = await fetch(new URL(href, location.href));
  return r.json();
});
ok('manifest enlazado y parseable', manifiesto && manifiesto.name === 'CALORÍA' && manifiesto.lang === 'es-MX' && manifiesto.display === 'standalone'
  && manifiesto.start_url === './' && manifiesto.scope === './' && manifiesto.icons.some((i) => i.purpose === 'maskable'), JSON.stringify({ name: manifiesto?.name, start_url: manifiesto?.start_url, icons: manifiesto?.icons?.length }));
await p.evaluate(() => navigator.serviceWorker.ready);
await p.reload();
await p.waitForTimeout(800);
const controlado = await p.evaluate(() => !!navigator.serviceWorker.controller);
ok('service worker controla la página tras recargar', controlado);
const caches_ = await p.evaluate(async () => (await caches.keys()));
ok('precache del shell creado', caches_.some((c) => c.includes('precache')), caches_.join(', '));
// Sin conexión: la app sigue abriendo
await ctx.setOffline(true);
await p.reload();
const offline = await p.getByText('Resumen del mes').waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
ok('abre sin conexión (shell precacheado)', offline);
await cap(p, 'movil-31-sin-conexion');
await ctx.setOffline(false);
await ctx.close();

// ───────────── Escritorio ─────────────
const ctx2 = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
const d = await ctx2.newPage();
vigilar(d);
await d.goto(BASE);
await d.waitForURL(/#\/bienvenida/);
await d.getByRole('button', { name: 'Omitir' }).click();
await d.waitForURL(/#\/$/);
ok('omitir asistente (escritorio)', true);
await sembrar(d);
await d.reload();
await d.locator('aside').waitFor();
ok('barra lateral visible en escritorio', await d.locator('aside').isVisible());
await d.getByLabel('Día anterior').click();
await d.getByText('Comida de prueba').first().waitFor();
await cap(d, 'escritorio-01-dia');
await d.getByRole('button', { name: 'Registrar comida' }).first().click();
await d.getByRole('searchbox', { name: 'Buscar alimento' }).fill('pollo');
await d.waitForTimeout(600);
await cap(d, 'escritorio-02-hoja-registro');
await d.keyboard.press('Escape');
for (const [ruta, nombre, texto] of [
  ['#/estadisticas', 'escritorio-03-estadisticas', 'Calorías y meta'],
  ['#/peso', 'escritorio-04-peso', 'Peso y tendencia'],
  ['#/calendario', 'escritorio-05-calendario', 'Resumen del mes'],
  ['#/mas/perfil', 'escritorio-06-perfil', 'Tu meta diaria'],
]) {
  await d.goto(`${BASE}${ruta}`);
  const visible = await d.getByText(texto).first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  ok(`escritorio ${ruta}`, visible);
  await cap(d, nombre);
}
await ctx2.close();
await navegador.close();

console.log('\nErrores de consola/página:', errores.length ? `\n  ${[...new Set(errores)].join('\n  ')}` : 'ninguno');
const fallas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallas.length}/${resultados.length} comprobaciones OK`);
process.exit(fallas.length ? 1 : 0);
