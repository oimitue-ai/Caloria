// Sección 1, 3 (parcial) y 4: registro real desde el catálogo en las 6 comidas, edición, deshacer,
// exactitud contra la fuente cruda (USDA JSON / OFF TSV) y persistencia tras cerrar el navegador.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { BASE, RAIZ, SALIDA, ok, nota, cap, vigilar, completarAsistente, abrirPersistente, num } from './comun.mjs';

export const PERFIL_DIR = '/tmp/caloria-auditoria/perfil-movil';
const NOMBRE_COMIDA = { desayuno: 'Desayuno', colacion1: 'Primera colación', almuerzo: 'Almuerzo', comida: 'Comida', cena: 'Cena', colacion2: 'Segunda colación' };

/** Lo que se registra. `opcion`: regex de la unidad a elegir (null = la predeterminada). */
export const PLAN = [
  { comida: 'desayuno', q: 'plátano', nombre: /^Plátano$/, id: 'usda_sr_legacy:173944', opcion: null, cantidad: 2, base: 118 },
  { comida: 'desayuno', q: 'leche deslactosada lala', nombre: /^Leche deslactosada$/, marca: /^Lala$/, id: 'off:75042707', opcion: /^mililitros$/, cantidad: 250, base: 1 },
  { comida: 'desayuno', q: 'huevo', nombre: /^Huevo entero, crudo$/, id: 'usda_sr_legacy:171287', opcion: /pieza grande/, cantidad: 2, base: 50 },
  { comida: 'colacion1', q: 'licuado de plátano', nombre: /^Licuado de plátano$/, id: 'caloria_recetas:licuado-platano', opcion: null, cantidad: 1, base: 383.8 },
  { comida: 'colacion1', codigo: '7500478002801', id: 'off:7500478002801', opcion: /^gramos$/, cantidad: 30, base: 1 },
  { comida: 'almuerzo', q: 'tortilla de maíz', nombre: /^Tortilla de maíz$/, id: 'usda_sr_legacy:175036', opcion: /^1 tortilla/, cantidad: 3, base: 24 },
  { comida: 'almuerzo', q: 'frijoles refritos', nombre: /^Frijoles refritos$/, id: 'usda_fndds:2707396', opcion: null, cantidad: 0.5, base: 260 },
  { comida: 'almuerzo', codigo: '795709010077', id: 'usda_branded:405016', opcion: /^gramos$/, cantidad: 170, base: 1 },
  { comida: 'comida', q: 'arroz', nombre: /^Arroz blanco, cocido$/, id: 'usda_sr_legacy:168878', opcion: null, cantidad: 1, base: 158 },
  { comida: 'comida', q: 'pozole', nombre: /^Pozole rojo de cerdo/, id: 'caloria_recetas:pozole-rojo-plato', opcion: null, cantidad: 1, base: 513 },
  { comida: 'comida', q: 'barbacoa', nombre: /^Barbacoa de res$/, id: 'caloria_recetas:barbacoa-res', opcion: /^gramos$/, cantidad: 150, base: 1 },
  { comida: 'cena', q: 'coca cola', nombre: /^Coca-Cola$/, id: 'off:7501055341344', opcion: /^mililitros$/, cantidad: 355, base: 1 },
  { comida: 'colacion2', q: 'tortilla de maíz', nombre: /^Tortilla de maíz$/, id: 'usda_sr_legacy:175036', opcion: /^1 tortilla/, cantidad: 1, base: 24 },
];

export async function leerTabla(p, tabla) {
  return p.evaluate((t) => new Promise((res, rej) => {
    const r = indexedDB.open('caloria');
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(t)) { db.close(); res([]); return; }
      const q = db.transaction(t).objectStore(t).getAll();
      q.onsuccess = () => { db.close(); res(q.result); };
      q.onerror = () => rej(q.error);
    };
    r.onerror = () => rej(r.error);
  }), tabla);
}

async function abrirHoja(p, comida) {
  await p.getByRole('button', { name: `Agregar a ${NOMBRE_COMIDA[comida]}`, exact: true }).first().click();
  const s = p.getByRole('searchbox', { name: 'Buscar alimento' });
  await s.waitFor();
  return s;
}

async function elegirResultado(p, item) {
  const lista = p.locator('[aria-label="Resultados del catálogo"] > li');
  for (let intento = 0; intento < 6; intento++) {
    const filas = lista.filter({ has: p.locator('span.line-clamp-2', { hasText: item.nombre }) });
    const cand = item.marca ? filas.filter({ has: p.locator('span.truncate', { hasText: item.marca }) }) : filas;
    if (await cand.count()) { await cand.first().locator('button').click(); return true; }
    const mas = p.getByRole('button', { name: 'Mostrar más resultados' });
    if (await mas.count()) { await mas.click(); await p.waitForTimeout(500); } else await p.waitForTimeout(500);
  }
  return false;
}

export async function registrarItem(p, item) {
  const s = await abrirHoja(p, item.comida);
  if (item.codigo) {
    await p.getByRole('dialog').getByRole('button', { name: 'Buscar por código de barras' }).click();
    await p.getByRole('dialog').getByLabel('Código de barras').fill(item.codigo);
    await p.getByRole('dialog').getByRole('button', { name: 'Buscar', exact: true }).click();
  } else {
    await s.fill(item.q);
    await p.locator('[aria-label="Resultados del catálogo"] > li').first().waitFor({ timeout: 15000 });
    await p.waitForTimeout(400);
    if (!(await elegirResultado(p, item))) return { error: `no se encontró ${item.nombre} para "${item.q}"` };
  }
  const panel = p.getByRole('dialog');
  await panel.getByText('Vas a agregar').waitFor({ timeout: 15000 });
  const unidad = panel.getByLabel('Unidad');
  const opciones = await unidad.locator('option').allTextContents();
  const defecto = await unidad.evaluate((s) => s.options[s.selectedIndex]?.text);
  if (item.opcion) {
    const i = opciones.findIndex((o) => item.opcion.test(o));
    if (i < 0) return { error: `sin opción ${item.opcion} (${opciones.join(' | ')})`, opciones };
    await unidad.selectOption({ index: i });
  }
  await panel.locator('#cantidad-registro').fill(String(item.cantidad));
  const vista = (await panel.locator('[aria-live="polite"]').filter({ hasText: 'Vas a agregar' }).innerText()).replace(/\s+/g, ' ');
  const nombre = await panel.locator('form p.font-display').first().innerText();
  await panel.getByRole('button', { name: `Agregar a ${NOMBRE_COMIDA[item.comida]}`, exact: true }).click();
  await p.getByText(/Agregado a /).first().waitFor({ timeout: 8000 });
  await panel.getByRole('button', { name: 'Listo' }).click();
  await p.waitForTimeout(250);
  return { defecto, opciones, vista, nombre };
}

/** Valores de la fuente cruda vía pruebas/herramientas/fuente.py. */
export function valoresFuente(ids) {
  const out = execFileSync('python3', ['-I', join(RAIZ, 'pruebas/herramientas/fuente.py'), ...ids], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = {};
  for (const l of out.trim().split('\n')) { const o = JSON.parse(l); m[o.id.replace(/^off:0+/, 'off:')] = o; }
  return m;
}

export async function probarRegistro() {
  const ctx = await abrirPersistente(PERFIL_DIR, undefined, true);
  const p = ctx.pages()[0] ?? await ctx.newPage();
  vigilar(p, 'registro');
  const asistente = await completarAsistente(p);
  // TMB Mifflin-St Jeor H: 10·82 + 6.25·172 − 5·34 + 5 = 1730; GET ×1.55 = 2681.5; −550 = 2131.5
  ok('asistente: TMB 1,730 kcal (Mifflin-St Jeor)', /Metabolismo basal \(TMB\) 1,730 kcal/.test(asistente));
  ok('asistente: GET 2,682 kcal (1730 × 1.55 = 2681.5)', /Gasto diario \(GET\) 2,682 kcal/.test(asistente));
  ok('asistente: meta 2,132 kcal (déficit 550 = 0.5 kg/sem × 7700 / 7)', /Propuesta diaria 2,132 kcal/.test(asistente));
  // proteína 1.8 g/kg = 147.6; grasa 27.5 % = 65.1 g; carbohidratos = (2131.5 − 590.4 − 586.2)/4 = 238.7
  ok('asistente: macros 148 / 239 / 65 g', /Proteína 148 g Carbohidratos 239 g Grasa 65 g/.test(asistente), asistente.match(/Proteína.*?Grasa \d+ g/)?.[0]);

  const detalles = [];
  for (const item of PLAN) {
    const r = await registrarItem(p, item);
    detalles.push({ ...item, ...r });
    ok(`registrar ${item.q ?? 'código ' + item.codigo} en ${item.comida}`, !r.error, r.error ?? `${r.nombre} · predet.: ${r.defecto} · ${r.vista.slice(0, 60)}`);
  }
  await cap(p, 'registro-01-dia-completo');

  // ── Exactitud: BD vs fuente cruda ──
  const regs = await leerTabla(p, 'registros');
  ok('13 registros guardados', regs.length === PLAN.length, regs.length);
  const ids = [...new Set(PLAN.map((x) => x.id).filter((i) => !i.startsWith('caloria_recetas')))];
  const fuente = valoresFuente(ids);
  const tabla = [];
  for (const item of PLAN) {
    const r = regs.find((x) => x.alimentoId === item.id && x.comida === item.comida && Math.abs(x.cantidad - item.cantidad) < 1e-9);
    if (!r) { ok(`registro de ${item.id} en BD`, false); continue; }
    const f = fuente[item.id];
    const baseEsperada = item.cantidad * item.base;
    const fila = { id: item.id, nombre: r.instantanea.nombre, cantidad: `${item.cantidad} ${r.porcionEtiqueta ?? r.unidad}`, cantidadBase: r.cantidadBase, baseEsperada };
    ok(`${item.id}: cantidadBase ${r.cantidadBase} = ${item.cantidad} × ${item.base}`, Math.abs(r.cantidadBase - baseEsperada) < 0.051, '');
    if (f && !f.error) {
      const kcal100 = Number(f.kcal ?? f.kcal_atwater_general);
      for (const [k, v] of [['kcal', kcal100], ['proteina', Number(f.proteina)], ['carbohidratos', Number(f.carbohidratos)], ['grasa', Number(f.grasa)]]) {
        const esperado = (v * r.cantidadBase) / 100;
        fila[k] = { app: +r.totales[k].toFixed(2), fuente: +esperado.toFixed(2), por100App: r.instantanea.nutrientes[k], por100Fuente: v };
        // el catálogo redondea a 2 decimales por 100 g: tolerancia relativa 0.5 % o 0.05 abs
        ok(`${item.id} ${k}: app ${r.totales[k].toFixed(2)} vs fuente ${esperado.toFixed(2)}`, Math.abs(r.totales[k] - esperado) <= Math.max(0.05, Math.abs(esperado) * 0.005));
      }
      fila.descripcionFuente = f.descripcion;
    } else fila.fuente = 'receta (ver tabla de recetas)';
    tabla.push(fila);
  }

  // ── Sumas por comida y por día (UI vs BD) ──
  const totDia = regs.reduce((s, r) => s + r.totales.kcal, 0);
  const consumidas = num(await p.locator('dt:text-is("Consumidas") + dd').first().innerText());
  ok(`total del día en la UI = suma de registros (${Math.round(totDia)})`, consumidas === Math.round(totDia), consumidas);
  for (const [c, nombre] of Object.entries(NOMBRE_COMIDA)) {
    const suma = regs.filter((r) => r.comida === c).reduce((s, r) => s + r.totales.kcal, 0);
    const txt = await p.locator(`li[aria-labelledby="comida-${c}"] > div span.text-sm.font-semibold`).first().innerText().catch(() => '');
    ok(`suma de ${nombre} en la UI (${Math.round(suma)} kcal)`, num(txt) === Math.round(suma), txt);
  }
  const anillo = await p.locator('[aria-label="Resumen del día"]').innerText().catch(() => '');
  nota(`resumen del día: ${anillo.replace(/\s+/g, ' ').slice(0, 120)}`);

  // ── Editar cantidad, cambiar unidad, eliminar, deshacer ──
  await p.getByRole('button', { name: /^Plátano, 2 × / }).click();
  await p.getByRole('dialog').getByLabel('Cantidad', { exact: true }).fill('1.5');
  await p.getByRole('dialog').getByRole('button', { name: 'Guardar cambios' }).click();
  await p.getByText('Cambios guardados').first().waitFor();
  let r2 = (await leerTabla(p, 'registros')).find((r) => r.alimentoId === 'usda_sr_legacy:173944');
  ok('editar cantidad: plátano 1.5 piezas = 177 g, 157.53 kcal', r2.cantidadBase === 177 && Math.abs(r2.totales.kcal - 157.53) < 0.01, `${r2.cantidadBase} g ${r2.totales.kcal}`);

  await p.getByRole('button', { name: /^Frijoles refritos, / }).click();
  const dlg = p.getByRole('dialog');
  const ops = await dlg.getByLabel('Unidad').locator('option').allTextContents();
  await dlg.getByLabel('Unidad').selectOption({ index: ops.findIndex((o) => o === 'gramos') });
  await dlg.getByLabel('Cantidad', { exact: true }).fill('120');
  await dlg.getByRole('button', { name: 'Guardar cambios' }).click();
  await p.getByText('Cambios guardados').first().waitFor();
  r2 = (await leerTabla(p, 'registros')).find((r) => r.alimentoId === 'usda_fndds:2707396');
  ok('cambiar unidad taza → 120 g: 108 kcal y sin porción', r2.unidad === 'g' && r2.cantidadBase === 120 && Math.abs(r2.totales.kcal - 108) < 1e-6 && !r2.porcionEtiqueta, JSON.stringify({ u: r2.unidad, b: r2.cantidadBase, k: r2.totales.kcal, p: r2.porcionEtiqueta }));

  await p.getByRole('button', { name: /^Coca-Cola, / }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await p.getByText(/Eliminado de Cena/).waitFor();
  ok('eliminar Coca-Cola', (await p.getByRole('button', { name: /^Coca-Cola, / }).count()) === 0);
  await p.getByRole('button', { name: 'Deshacer' }).click();
  await p.waitForTimeout(400);
  ok('deshacer eliminación', (await p.getByRole('button', { name: /^Coca-Cola, / }).count()) === 1);
  await p.getByRole('button', { name: /^Huevo entero, crudo, / }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await p.getByText(/Eliminado de Desayuno/).waitFor();
  await p.waitForTimeout(6500); // deja expirar el aviso
  const finales = await leerTabla(p, 'registros');
  ok('tras editar/eliminar quedan 12 registros', finales.length === 12, finales.length);
  await cap(p, 'registro-02-editado');

  // Deshacer de "Agregado" (hoja de registro)
  const s = await abrirHoja(p, 'cena');
  await s.fill('plátano');
  await p.locator('[aria-label="Resultados del catálogo"] > li').first().waitFor();
  await p.waitForTimeout(300);
  await elegirResultado(p, { nombre: /^Plátano$/ });
  await p.getByRole('dialog').getByText('Vas a agregar').waitFor();
  await p.getByRole('dialog').getByRole('button', { name: 'Agregar a Cena' }).click();
  await p.getByRole('button', { name: 'Deshacer' }).click();
  await p.waitForTimeout(500);
  ok('deshacer "Agregado" desde la hoja', (await leerTabla(p, 'registros')).length === 12);
  await p.keyboard.press('Escape');

  // ── Inmutabilidad del historial al editar un alimento propio ──
  await p.goto(`${BASE}#/mas/alimentos/nuevo`);
  await p.getByLabel('Nombre', { exact: true }).fill('Gelatina auditoría');
  await p.getByLabel('Calorías').fill('60');
  await p.getByLabel('Proteína').fill('1.5');
  await p.getByLabel('Carbohidratos').fill('14');
  await p.getByLabel('Grasa', { exact: true }).fill('0');
  await p.getByRole('button', { name: 'Crear alimento' }).click();
  await p.waitForURL(/#\/mas\/alimentos$/);
  await p.goto(`${BASE}#/`);
  const sg = await abrirHoja(p, 'colacion2');
  await sg.fill('gelatina audit');
  await p.getByRole('button', { name: /Gelatina auditoría/ }).first().click();
  await p.getByRole('dialog').getByText('Vas a agregar').waitFor();
  await p.locator('#cantidad-registro').fill('200');
  await p.getByRole('dialog').getByRole('button', { name: 'Agregar a Segunda colación' }).click();
  await p.getByText(/Agregado a /).first().waitFor();
  await p.getByRole('dialog').getByRole('button', { name: 'Listo' }).click();
  const propio = (await leerTabla(p, 'alimentosUsuario')).find((a) => a.nombre === 'Gelatina auditoría');
  await p.goto(`${BASE}#/mas/alimentos`);
  await p.getByRole('link', { name: /^Gelatina auditoría/ }).click();
  await p.getByLabel('Calorías').fill('999');
  await p.getByLabel('Nombre', { exact: true }).fill('Gelatina auditoría EDITADA');
  await p.getByRole('button', { name: /Guardar/ }).first().click();
  await p.waitForTimeout(800);
  const editado = (await leerTabla(p, 'alimentosUsuario')).find((a) => a.id === propio.id);
  const regG = (await leerTabla(p, 'registros')).find((r) => r.alimentoId === propio.id);
  ok('alimento propio editado (999 kcal)', editado?.nutrientes.kcal === 999, editado?.nutrientes.kcal);
  ok('historial inmutable: el registro conserva 120 kcal y el nombre original', regG && regG.totales.kcal === 120 && regG.instantanea.nombre === 'Gelatina auditoría', JSON.stringify(regG?.totales));
  await p.goto(`${BASE}#/`);
  const fila = await p.getByRole('button', { name: /^Gelatina auditoría, 200 g, 120 kcal/ }).waitFor({ timeout: 8000 }).then(() => 1).catch(() => 0);
  ok('la UI del día sigue mostrando "Gelatina auditoría, 200 g, 120 kcal"', fila === 1);

  const snapshot = { registros: (await leerTabla(p, 'registros')).length, pesos: (await leerTabla(p, 'pesos')).length, metas: (await leerTabla(p, 'metas')).length };
  await ctx.close();

  // ── Persistencia: cerrar y volver a abrir el navegador con el mismo perfil ──
  const ctx2 = await abrirPersistente(PERFIL_DIR);
  const q = ctx2.pages()[0] ?? await ctx2.newPage();
  vigilar(q, 'persistencia');
  await q.goto(BASE);
  await q.getByText('Consumidas').first().waitFor({ timeout: 15000 });
  const despues = { registros: (await leerTabla(q, 'registros')).length, pesos: (await leerTabla(q, 'pesos')).length, metas: (await leerTabla(q, 'metas')).length };
  ok('persistencia tras cerrar el navegador (registros/metas)', JSON.stringify(despues) === JSON.stringify(snapshot), JSON.stringify(despues));
  ok('no vuelve a mostrar el asistente', !q.url().includes('bienvenida'), q.url());
  ok('la UI muestra los registros tras reabrir', await q.getByRole('button', { name: /^Plátano, 1\.5 × / }).waitFor({ timeout: 8000 }).then(() => true).catch(() => false));
  const persist = await q.evaluate(async () => (navigator.storage?.persisted ? navigator.storage.persisted() : null));
  nota(`navigator.storage.persisted() = ${persist}`);
  await ctx2.close();

  writeFileSync(join(SALIDA, 'registro-exactitud.json'), JSON.stringify({ tabla, detalles: detalles.map((d) => ({ ...d, nombre: d.nombre?.toString(), opcion: d.opcion?.toString(), marca: d.marca?.toString() })) }, null, 1));
  return { tabla };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { resumen } = await import('./comun.mjs');
  await probarRegistro();
  process.exit(resumen() ? 1 : 0);
}
