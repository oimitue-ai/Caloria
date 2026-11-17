// Sección 9 (resto): entradas inválidas en la UI, IndexedDB no disponible, bloqueado por otra pestaña y cuota llena.
import { BASE, ok, nota, cap, vigilar, abrirNavegador, opcionesContexto, errores } from './comun.mjs';
import { leerTabla } from './registro.mjs';

async function panel(p, q) {
  await p.goto(`${BASE}#/`);
  await p.getByRole('button', { name: 'Agregar a Comida', exact: true }).click();
  await p.getByRole('searchbox', { name: 'Buscar alimento' }).fill(q);
  await p.locator('[aria-label="Resultados del catálogo"] > li').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(300);
  await p.locator('[aria-label="Resultados del catálogo"] > li button').first().click();
  await p.getByRole('dialog').getByText('Vas a agregar').waitFor();
}

export async function probarRobustez() {
  const b = await abrirNavegador();
  const ctx = await b.newContext(opcionesContexto());
  const p = await ctx.newPage();
  vigilar(p, 'robustez');
  await p.goto(BASE);
  await p.getByRole('button', { name: 'Omitir' }).click();

  // ── Cantidades inválidas en el panel de registro ──
  await panel(p, 'plátano');
  const boton = p.getByRole('dialog').getByRole('button', { name: 'Agregar a Comida' });
  for (const [valor, debeAceptar] of [['-5', false], ['0', false], ['abc', false], ['', false], ['1,5', true], ['1e3', true], ['999999', true], ['1e300', true]]) {
    await p.locator('#cantidad-registro').fill(valor);
    const habilitado = await boton.isEnabled();
    const vista = (await p.getByRole('dialog').locator('[aria-live="polite"]').filter({ hasText: 'Vas a agregar' }).innerText()).replace(/\s+/g, ' ').slice(0, 50);
    const alerta = await p.getByRole('dialog').getByRole('alert').allInnerTexts();
    if (!debeAceptar) ok(`cantidad "${valor}" rechazada (botón deshabilitado)`, !habilitado, `${vista} ${alerta.join(' ')}`);
    else nota(`cantidad "${valor}": botón ${habilitado ? 'HABILITADO' : 'deshabilitado'} · ${vista}`);
  }
  await p.locator('#cantidad-registro').fill('999999');
  ok('cantidad absurda (999 999 piezas ≈ 118 t de plátano) es rechazada o advertida', !(await boton.isEnabled()) || (await p.getByRole('dialog').getByText(/demasiad|revis|muy grande|excesiv/i).count()) > 0);
  await p.locator('#cantidad-registro').fill('1e300');
  if (await boton.isEnabled()) {
    await boton.click();
    await p.waitForTimeout(800);
    const r = (await leerTabla(p, 'registros')).at(-1);
    nota(`1e300 piezas: guardado=${!!r} kcal=${r?.totales.kcal}`);
    await p.goto(`${BASE}#/`);
    await p.waitForTimeout(500);
    const consumidas = await p.locator('dt:text-is("Consumidas") + dd').first().innerText().catch(() => '?');
    nota(`día con 1e300 piezas: "Consumidas" muestra ${consumidas}`);
    await cap(p, 'robustez-01-cantidad-enorme');
    ok('una cantidad de 1e300 no deja Infinity/NaN en la BD', r && Number.isFinite(r.totales.kcal) && r.totales.kcal < 1e7, r?.totales.kcal);
    const id = r?.id;
    if (id) await p.evaluate((i) => new Promise((res) => { const q = indexedDB.open('caloria'); q.onsuccess = () => { const t = q.result.transaction('registros', 'readwrite'); t.objectStore('registros').delete(i); t.oncomplete = () => { q.result.close(); res(); }; }; }), id);
  } else ok('1e300 rechazado', true);
  await p.keyboard.press('Escape');

  // ── Peso y perfil fuera de rango ──
  await p.goto(`${BASE}#/peso`);
  for (const v of ['-3', '0', '1000', 'abc']) {
    await p.getByLabel('Peso', { exact: true }).fill(v);
    ok(`peso "${v}" rechazado`, !(await p.getByRole('button', { name: /Guardar peso|Reemplazar peso/ }).isEnabled()));
  }

  // ── IndexedDB bloqueado por otra pestaña que abre una versión más nueva ──
  await p.goto(`${BASE}#/`);
  await p.getByText('Consumidas').first().waitFor();
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}#/mas/acerca`);
  const resBloqueo = await p2.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('caloria', 9999);
    let bloqueado = false;
    r.onblocked = () => { bloqueado = true; };
    r.onupgradeneeded = () => {};
    r.onsuccess = () => { r.result.close(); res({ bloqueado, abierto: true }); };
    r.onerror = () => res({ bloqueado, error: String(r.error) });
    setTimeout(() => res({ bloqueado, timeout: true }), 5000);
  }));
  nota(`otra pestaña pide versión 9999 de la BD: ${JSON.stringify(resBloqueo)}`);
  // la app (versión anterior) intenta registrar ahora
  await p.bringToFront();
  await p.getByRole('button', { name: 'Agregar a Cena', exact: true }).click();
  await p.getByRole('searchbox', { name: 'Buscar alimento' }).fill('mango');
  await p.locator('[aria-label="Resultados del catálogo"] > li').first().waitFor();
  await p.waitForTimeout(300);
  await p.locator('[aria-label="Resultados del catálogo"] > li button').first().click();
  await p.getByRole('dialog').getByText('Vas a agregar').waitFor();
  await p.getByRole('dialog').getByRole('button', { name: 'Agregar a Cena' }).click();
  const aviso = await p.getByText(/Agregado a|No se pudo|error|versión/i).first().waitFor({ timeout: 6000 }).then(() => p.getByText(/Agregado a|No se pudo|error|versión/i).first().innerText()).catch(() => '(sin aviso)');
  nota(`la app tras el cambio de versión en otra pestaña: aviso = "${aviso}"`);
  ok('BD reemplazada por otra pestaña: la app avisa en vez de fallar en silencio', !/sin aviso/.test(aviso), aviso);
  await cap(p, 'robustez-02-bd-version-nueva');
  await p2.close();
  await ctx.close();

  // ── IndexedDB no disponible (p. ej. modo privado de algunos navegadores) ──
  const ctx3 = await b.newContext(opcionesContexto());
  await ctx3.addInitScript(() => {
    const falla = () => { const r = {}; setTimeout(() => { r.error = new DOMException('IndexedDB deshabilitado (prueba)', 'InvalidStateError'); r.onerror?.({ target: r, preventDefault() {} }); }, 0); return r; };
    Object.defineProperty(window, 'indexedDB', { value: { open: falla, deleteDatabase: falla, cmp: () => 0, databases: async () => [] }, configurable: true });
  });
  const p3 = await ctx3.newPage();
  const errAntes = errores.length;
  vigilar(p3, 'sin-indexeddb');
  await p3.goto(BASE);
  await p3.waitForTimeout(3000);
  const texto = (await p3.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200);
  nota(`sin IndexedDB, la app muestra: "${texto}"`);
  ok('sin IndexedDB: la app no queda en blanco y explica el problema', texto.length > 20 && /almacen|datos|navegador|guardar|IndexedDB/i.test(texto), texto);
  await cap(p3, 'robustez-03-sin-indexeddb');
  nota(`errores registrados sin IndexedDB: ${errores.slice(errAntes).slice(0, 3).join(' | ')}`);
  await ctx3.close();

  // ── Cuota de almacenamiento llena (CDP Storage.overrideQuotaForOrigin) ──
  const ctx4 = await b.newContext(opcionesContexto());
  const p4 = await ctx4.newPage();
  vigilar(p4, 'cuota');
  const cdp = await ctx4.newCDPSession(p4);
  await p4.goto(BASE);
  await p4.getByRole('button', { name: 'Omitir' }).click();
  await p4.waitForTimeout(2500);
  const origen = new URL(BASE).origin;
  const uso = await p4.evaluate(async () => (await navigator.storage.estimate()).usage);
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: origen, quotaSize: uso + 1024 });
  await panel(p4, 'arroz');
  await p4.getByRole('dialog').getByRole('button', { name: 'Agregar a Comida' }).click();
  const avisoCuota = await p4.getByText(/Agregado a|No se pudo|espacio|cuota|almacenamiento|Quota/i).first().waitFor({ timeout: 6000 }).then(() => p4.getByText(/Agregado a|No se pudo|espacio|cuota|almacenamiento|Quota/i).first().innerText()).catch(() => '(sin aviso)');
  nota(`cuota llena (${uso} B + 1 KiB): aviso = "${avisoCuota}"`);
  ok('cuota llena: se informa al usuario (no falla en silencio)', !/sin aviso/.test(avisoCuota), avisoCuota);
  await cap(p4, 'robustez-04-cuota-llena');
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: origen });
  await ctx4.close();
  await b.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { resumen } = await import('./comun.mjs');
  await probarRobustez();
  process.exit(resumen() ? 1 : 0);
}
