// Secciones 5 y 9 (parcial): exportar JSON/CSV/Excel desde la UI, abrir y verificar los archivos; importar
// (reemplazar y combinar) en un perfil nuevo; respaldos malformados/maliciosos; XSS; inyección CSV.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { BASE, SALIDA, ok, nota, cap, vigilar, abrirPersistente, abrirNavegador, opcionesContexto, fechaMx } from './comun.mjs';
import { PERFIL_DIR, leerTabla, registrarItem } from './registro.mjs';

// ── Réplica exacta del JSON canónico de src/respaldo (para firmar respaldos de prueba) ──
function ordenar(v) {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) { const x = v[k]; if (x !== undefined) o[k] = ordenar(x); }
    return o;
  }
  return v;
}
export const firmar = (r) => ({ ...r, suma: { algoritmo: 'SHA-256', valor: createHash('sha256').update(JSON.stringify(ordenar(r.datos))).digest('hex') } });

/** CSV RFC 4180 mínimo. */
export function leerCSV(t) {
  const filas = []; let f = []; let c = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { f.push(c); c = ''; }
    else if (ch === '\r') { /* CRLF */ }
    else if (ch === '\n') { f.push(c); filas.push(f); f = []; c = ''; }
    else c += ch;
  }
  if (c || f.length) { f.push(c); filas.push(f); }
  return filas;
}

async function descargar(p, nombreBoton) {
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.getByRole('button', { name: nombreBoton }).click()]);
  const ruta = join(SALIDA, d.suggestedFilename());
  await d.saveAs(ruta);
  return { ruta, nombre: d.suggestedFilename() };
}

async function importarArchivo(p, ruta, modo) {
  await p.goto(`${BASE}#/mas/respaldo`);
  await p.locator('#archivo-respaldo').setInputFiles(ruta);
  const err = p.locator('[role="alert"]');
  const listo = p.getByRole('button', { name: /Combinar este respaldo|Reemplazar con este respaldo/ });
  await Promise.race([err.first().waitFor({ timeout: 10000 }), listo.waitFor({ timeout: 10000 })]).catch(() => {});
  if (await err.count()) return { error: await err.first().innerText() };
  const resumen = (await p.locator('text=Contiene:').locator('..').innerText()).replace(/\s+/g, ' ');
  if (modo === 'reemplazar') await p.getByRole('radio', { name: 'Reemplazar todo' }).click();
  await p.getByRole('button', { name: /Combinar este respaldo|Reemplazar con este respaldo/ }).click();
  await p.getByRole('alertdialog').getByRole('button', { name: modo === 'reemplazar' ? 'Reemplazar' : 'Combinar', exact: true }).click();
  const aviso = await p.getByText(/Respaldo importado|No se pudo|inválid/).first().waitFor({ timeout: 10000 }).then(() => p.getByText(/Respaldo importado|No se pudo|inválid/).first().innerText()).catch(() => '(sin aviso)');
  return { resumen, aviso };
}

export async function probarRespaldo() {
  // ── Exportar desde el perfil con datos reales (sección 1) ──
  const ctx = await abrirPersistente(PERFIL_DIR);
  const p = ctx.pages()[0] ?? await ctx.newPage();
  vigilar(p, 'respaldo');
  await p.goto(BASE);
  await p.getByText('Consumidas').first().waitFor({ timeout: 15000 });
  // alimento con nombre de fórmula (inyección CSV) y con HTML (XSS) creados desde la UI
  for (const nombre of ['=HYPERLINK("http://ejemplo.invalid","clic")', '<img src=x onerror="window.__xss=1">Taco <b>XSS</b>']) {
    await p.goto(`${BASE}#/mas/alimentos/nuevo`);
    await p.getByLabel('Nombre', { exact: true }).fill(nombre);
    await p.getByLabel('Calorías').fill('100');
    await p.getByLabel('Proteína').fill('1');
    await p.getByLabel('Carbohidratos').fill('20');
    await p.getByLabel('Grasa', { exact: true }).fill('1');
    await p.getByRole('button', { name: 'Crear alimento' }).click();
    await p.waitForURL(/#\/mas\/alimentos$/);
    await p.goto(`${BASE}#/`);
    await p.getByRole('button', { name: 'Agregar a Cena', exact: true }).click();
    await p.getByRole('searchbox', { name: 'Buscar alimento' }).fill(nombre.includes('HYPER') ? 'hyperlink' : 'taco xss');
    await p.locator('[aria-label="Tus alimentos y recetas"] button').first().click();
    await p.getByRole('dialog').getByText('Vas a agregar').waitFor();
    await p.getByRole('dialog').getByRole('button', { name: 'Agregar a Cena' }).click();
    await p.getByText(/Agregado a /).first().waitFor();
    await p.getByRole('dialog').getByRole('button', { name: 'Listo' }).click();
  }
  await p.goto(`${BASE}#/mas/alimentos`);
  await p.waitForTimeout(500);
  ok('XSS: el nombre con HTML se muestra como texto y no se ejecuta (Mis alimentos)', (await p.evaluate(() => window.__xss)) === undefined && (await p.getByText('<img src=x onerror="window.__xss=1">Taco <b>XSS</b>').count()) >= 1);
  await p.goto(`${BASE}#/`);
  await p.waitForTimeout(500);
  ok('XSS: tampoco se ejecuta en el día', (await p.evaluate(() => window.__xss)) === undefined);

  const regsBD = await leerTabla(p, 'registros');
  const pesosBD = await leerTabla(p, 'pesos');
  await p.goto(`${BASE}#/mas/respaldo`);
  const json = await descargar(p, /Respaldo completo \(JSON\)/);
  const csv = await descargar(p, /Comidas \(CSV\)/);
  const csvPeso = await descargar(p, /Peso \(CSV\)/);
  const xlsx = await descargar(p, /Excel \(\.xlsx\)/);
  ok('nombres de archivo', /caloria-respaldo-\d{4}-\d{2}-\d{2}\.json$/.test(json.nombre) && /\.csv$/.test(csv.nombre) && /\.xlsx$/.test(xlsx.nombre), [json.nombre, csv.nombre, csvPeso.nombre, xlsx.nombre].join(', '));
  ok('tras exportar JSON se anota la fecha del último respaldo', !!(await leerTabla(p, 'config'))[0]?.ultimoRespaldo);
  await ctx.close();

  // JSON
  const r = JSON.parse(readFileSync(json.ruta, 'utf8'));
  ok('JSON: formato, versión, conteos', r.formato === 'caloria-respaldo' && r.version >= 1 && r.conteos.registros === regsBD.length && r.datos.registros.length === regsBD.length, JSON.stringify(r.conteos));
  ok('JSON: suma SHA-256 verificable fuera de la app', firmar(r).suma.valor === r.suma.valor);
  // CSV comidas
  const tcsv = readFileSync(csv.ruta, 'utf8');
  ok('CSV: UTF-8 con BOM y CRLF', tcsv.charCodeAt(0) === 0xfeff && tcsv.includes('\r\n'));
  const filas = leerCSV(tcsv.slice(1));
  const cab = filas[0];
  const datosCsv = filas.slice(1).filter((f) => f.length > 1);
  ok('CSV: una fila por registro', datosCsv.length === regsBD.length, `${datosCsv.length} filas / ${regsBD.length} registros`);
  const iK = cab.indexOf('Calorías (kcal)');
  const sumaCsv = datosCsv.reduce((s, f) => s + Number(f[iK]), 0);
  const sumaBD = regsBD.reduce((s, x) => s + x.totales.kcal, 0);
  ok('CSV: suma de kcal = BD (redondeo a 2 decimales)', Math.abs(sumaCsv - sumaBD) < 0.01 * regsBD.length, `${sumaCsv.toFixed(2)} vs ${sumaBD.toFixed(2)}`);
  const iA = cab.indexOf('Alimento');
  const celdaFormula = datosCsv.find((f) => f[iA].includes('HYPERLINK'))?.[iA];
  ok('CSV injection: el nombre "=HYPERLINK…" se exporta con apóstrofo', celdaFormula?.startsWith("'="), celdaFormula);
  ok('CSV: acentos intactos (Plátano)', datosCsv.some((f) => f[iA] === 'Plátano'));
  const filasPeso = leerCSV(readFileSync(csvPeso.ruta, 'utf8').slice(1)).filter((f) => f.length > 1);
  ok('CSV peso: filas = pesos', filasPeso.length - 1 === pesosBD.length, `${filasPeso.length - 1} / ${pesosBD.length}; cab: ${filasPeso[0].join('|')}`);
  // XLSX
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(xlsx.ruta);
  const hojas = libro.worksheets.map((h) => h.name);
  ok('XLSX: hojas esperadas', ['Comidas', 'Resumen diario', 'Peso', 'Recetas', 'Alimentos propios'].every((h) => hojas.includes(h)), hojas.join(', '));
  const hc = libro.getWorksheet('Comidas');
  const cabX = hc.getRow(1).values.slice(1);
  const colK = cabX.indexOf('Calorías (kcal)') + 1;
  let sumaX = 0; let n = 0; let formulas = 0;
  hc.eachRow((row, i) => {
    if (i === 1) return; n++; sumaX += Number(row.getCell(colK).value) || 0;
    row.eachCell((c) => { if (c.type === ExcelJS.ValueType.Formula) formulas++; });
  });
  ok('XLSX Comidas: filas y suma de kcal = BD', n === regsBD.length && Math.abs(sumaX - sumaBD) < 0.01 * n, `${n} filas, ${sumaX.toFixed(2)} kcal`);
  ok('XLSX: ninguna celda es fórmula (nombre "=HYPERLINK…" queda como texto)', formulas === 0, `${formulas} fórmulas`);
  const hr = libro.getWorksheet('Resumen diario');
  const filasR = []; hr.eachRow((row, i) => { if (i > 1) filasR.push(row.values.slice(1)); });
  nota(`XLSX Resumen diario: ${hr.getRow(1).values.slice(1).join(' | ')} → ${JSON.stringify(filasR[0])}`);
  const hoyMx = fechaMx(0);
  const filaHoy = filasR.find((f) => String(f[0]).startsWith(hoyMx) || (f[0] instanceof Date && f[0].toISOString().startsWith(hoyMx)));
  ok('XLSX Resumen diario: el total de hoy = BD', filaHoy && filaHoy.some((v) => typeof v === 'number' && Math.abs(v - sumaBD) < 0.05), JSON.stringify(filaHoy));

  // ── Importar en un perfil nuevo: reemplazar y luego combinar ──
  const b = await abrirNavegador();
  const c2 = await b.newContext(opcionesContexto());
  const q = await c2.newPage();
  vigilar(q, 'importar');
  await q.goto(BASE);
  await q.getByRole('button', { name: 'Omitir' }).click();
  const rep = await importarArchivo(q, json.ruta, 'reemplazar');
  ok('importar (reemplazar) en perfil nuevo', /Respaldo importado/.test(rep.aviso ?? ''), `${rep.resumen} → ${rep.aviso}`);
  const tras = await leerTabla(q, 'registros');
  ok('reemplazar deja exactamente los registros del respaldo', tras.length === r.datos.registros.length && tras.every((x) => r.datos.registros.some((y) => y.id === x.id && y.totales.kcal === x.totales.kcal)));
  await q.goto(`${BASE}#/`);
  ok('la app muestra el día restaurado', await q.getByRole('button', { name: /^Plátano, 1\.5 × / }).waitFor({ timeout: 8000 }).then(() => true).catch(() => false));
  // agregar un registro nuevo y combinar el mismo respaldo: no debe duplicar ni borrar
  const nuevo = await registrarItem(q, { comida: 'cena', q: 'mango', nombre: /^Mango$/, opcion: null, cantidad: 1 });
  ok('registro nuevo en el perfil restaurado', !nuevo.error, nuevo.error);
  const antes = (await leerTabla(q, 'registros')).length;
  const comb = await importarArchivo(q, json.ruta, 'combinar');
  const despues = (await leerTabla(q, 'registros')).length;
  ok('combinar el mismo respaldo no duplica ni borra', despues === antes && /Respaldo importado: 0 elementos/.test(comb.aviso ?? ''), `${antes} → ${despues}; ${comb.aviso}`);
  // combinar en un perfil con datos distintos
  const r3 = JSON.parse(readFileSync(json.ruta, 'utf8'));
  r3.datos.registros = r3.datos.registros.slice(0, 3).map((x, i) => ({ ...x, id: `combinado-${i}`, fecha: fechaMx(-3) }));
  r3.datos.pesos = [{ id: 'peso-combinado', fecha: fechaMx(-3), pesoKg: 81.2 }];
  const ruta3 = join(SALIDA, 'respaldo-combinar.json');
  writeFileSync(ruta3, JSON.stringify(firmar(r3)));
  const comb2 = await importarArchivo(q, ruta3, 'combinar');
  const regs3 = await leerTabla(q, 'registros');
  ok('combinar agrega lo nuevo (3 registros + 1 peso) y conserva lo existente', regs3.length === despues + 3 && (await leerTabla(q, 'pesos')).some((x) => x.id === 'peso-combinado'), `${comb2.aviso}; ${regs3.length}`);

  // ── Respaldos malformados o maliciosos ──
  const casos = [];
  const escribir = (nombre, contenido) => { const ruta = join(SALIDA, nombre); writeFileSync(ruta, contenido); return ruta; };
  casos.push(['no es JSON', escribir('malo-1.json', '{esto no es json'), /no es un respaldo válido/]);
  casos.push(['JSON de otra app', escribir('malo-2.json', JSON.stringify({ hola: 1 })), /no es un respaldo de CALORÍA/]);
  const base = JSON.parse(readFileSync(json.ruta, 'utf8'));
  const alterado = JSON.parse(JSON.stringify(base)); alterado.datos.registros[0].totales.kcal = 1;
  casos.push(['suma de verificación alterada', escribir('malo-3.json', JSON.stringify(alterado)), /suma de verificación no coincide/]);
  const negativo = JSON.parse(JSON.stringify(base)); negativo.datos.registros[0].cantidad = -5;
  casos.push(['cantidad negativa (firmado)', escribir('malo-4.json', JSON.stringify(firmar(negativo))), /Datos inválidos en registros\[0\]/]);
  const futuro = { ...base, version: 99 };
  casos.push(['versión futura', escribir('malo-5.json', JSON.stringify(futuro)), /versión más nueva/]);
  const tipo = JSON.parse(JSON.stringify(base)); tipo.datos.registros = 'texto';
  casos.push(['tabla que no es lista (firmado)', escribir('malo-6.json', JSON.stringify(firmar(tipo))), /debe ser una lista/]);
  for (const [nombre, ruta, esperado] of casos) {
    const x = await importarArchivo(q, ruta, 'combinar');
    ok(`respaldo inválido rechazado: ${nombre}`, x.error && esperado.test(x.error), x.error ?? x.aviso);
  }
  // prototype pollution + HTML en nombres, firmado (pasa la suma) → importar con reemplazar
  const malicioso = JSON.parse(JSON.stringify(base));
  const txt = JSON.stringify(malicioso)
    .replace('"datos":{', '"datos":{"__proto__":{"contaminado":"datos"},"constructor":{"prototype":{"contaminado":"ctor"}},')
    .replace('"perfil":{', '"perfil":{"__proto__":{"contaminado":"perfil"},');
  const mal = JSON.parse(txt);
  mal.datos.registros[0].instantanea.nombre = '<script>window.__xss2=1</script><img src=x onerror="window.__xss2=1">';
  mal.datos.registros[0].instantanea.nutrientes.micros = JSON.parse('{"__proto__":{"contaminado":"micros"},"calcio_mg":1}');
  const rutaMal = escribir('malicioso.json', JSON.stringify(firmar(mal)));
  const xm = await importarArchivo(q, rutaMal, 'reemplazar');
  nota(`respaldo malicioso firmado: ${xm.error ?? xm.aviso}`);
  await q.goto(`${BASE}#/`);
  await q.waitForTimeout(800);
  const contaminado = await q.evaluate(() => ({ obj: ({}).contaminado, arr: [].contaminado, xss: window.__xss2 }));
  ok('prototype pollution: Object.prototype intacto tras importar', contaminado.obj === undefined && contaminado.arr === undefined, JSON.stringify(contaminado));
  ok('HTML/script en nombres importados no se ejecuta', contaminado.xss === undefined);
  const perfilImp = (await leerTabla(q, 'perfil'))[0];
  ok('el perfil importado no arrastra claves "__proto__"', perfilImp && !Object.prototype.hasOwnProperty.call(perfilImp, '__proto__'), Object.keys(perfilImp ?? {}).join(','));
  await cap(q, 'respaldo-01-malicioso-dia');
  await b.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { resumen } = await import('./comun.mjs');
  await probarRespaldo();
  process.exit(resumen() ? 1 : 0);
}
