// Sección 6 (+3: promedios de peso, cumplimiento): siembra 70 días con la API real de src/bd en el navegador
// (servidor de desarrollo de Vite, `import('/src/bd/index.ts')`), y compara estadísticas, calendario, peso e
// historial editado contra un cálculo independiente hecho aquí.
import { spawn } from 'node:child_process';
import { RAIZ, ok, nota, cap, vigilar, abrirNavegador, opcionesContexto, fechaMx, num } from './comun.mjs';

const PUERTO = Number(process.env.PUERTO_DEV ?? 5199);
const DEV = `http://localhost:${PUERTO}/`;
const DIAS = 70;
const gramosDia = (d) => 1600 + ((d * 173) % 900); // plátano 89 kcal/100 g → 1424…2224 kcal
const pesoDia = (d) => Math.round((84 - 0.045 * (DIAS - d) + Math.sin(d) * 0.3) * 10) / 10;
const registrado = (d) => d % 9 !== 0;

function sumarDias(f, n) { const x = new Date(`${f}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

async function levantarDev() {
  const proc = spawn('npx', ['vite', '--port', String(PUERTO), '--strictPort'], { cwd: RAIZ, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(DEV); if (r.ok) return proc; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no arrancó vite dev');
}

/** Cálculo independiente (sin usar src/nucleo). */
function esperado(hoy, dias) {
  const desde = sumarDias(hoy, -(dias - 1));
  const meta = (f) => (f >= sumarDias(hoy, -30) ? 1800 : f >= sumarDias(hoy, -DIAS) ? 2000 : null);
  const filas = [];
  for (let f = desde; f <= hoy; f = sumarDias(f, 1)) {
    const d = Math.round((Date.parse(hoy) - Date.parse(f)) / 864e5);
    const reg = d >= 1 && d <= DIAS && registrado(d);
    filas.push({ f, reg, kcal: reg ? (89 * gramosDia(d)) / 100 : null, meta: meta(f) });
  }
  const regs = filas.filter((x) => x.reg);
  const conMeta = regs.filter((x) => x.meta);
  const cumplidos = conMeta.filter((x) => Math.abs(x.kcal - x.meta) <= x.meta * 0.1 + 1e-9);
  let max = 0; let run = 0;
  for (const x of filas) { run = x.reg ? run + 1 : 0; max = Math.max(max, run); }
  let actual = 0; for (let i = filas.length - 1; i >= 0 && filas[i].reg; i--) actual++;
  return {
    diasPeriodo: filas.length, diasRegistrados: regs.length,
    promedio: regs.reduce((s, x) => s + x.kcal, 0) / regs.length,
    cumplimiento: cumplidos.length / conMeta.length, cumplidos: cumplidos.length, conMeta: conMeta.length,
    metaProm: conMeta.reduce((s, x) => s + x.meta, 0) / conMeta.length, rachaMax: max, rachaActual: actual,
  };
}

export async function probarHistorial() {
  const dev = await levantarDev();
  const b = await abrirNavegador();
  try {
    const ctx = await b.newContext(opcionesContexto());
    const p = await ctx.newPage();
    vigilar(p, 'historial');
    await p.goto(DEV);
    await p.getByRole('button', { name: 'Omitir' }).click();
    const hoy = await p.evaluate(async () => (await import('/src/nucleo/index.ts')).hoy());
    ok('zona horaria: hoy() de la app = fecha local de México', hoy === fechaMx(0), `${hoy} / ${fechaMx(0)}`);
    const t0 = Date.now();
    const res = await p.evaluate(async ({ DIAS, hoy }) => {
      const bd = await import('/src/bd/index.ts');
      const { catalogo } = await import('/src/catalogo/index.ts');
      const { sumarDias } = await import('/src/nucleo/index.ts');
      const platano = await catalogo.obtener('usda_sr_legacy:173944');
      await bd.guardarPerfil({ sexo: 'mujer', edad: 40, estaturaCm: 160, pesoObjetivoKg: 78, objetivo: 'perder', actividad: 'ligero' });
      await bd.guardarMetas({ kcal: 2000, proteina: 110, carbohidratos: 230, grasa: 65, desde: sumarDias(hoy, -DIAS) });
      await bd.guardarMetas({ kcal: 1800, proteina: 110, carbohidratos: 200, grasa: 60, desde: sumarDias(hoy, -30) });
      const gramosDia = (d) => 1600 + ((d * 173) % 900);
      const pesoDia = (d) => Math.round((84 - 0.045 * (DIAS - d) + Math.sin(d) * 0.3) * 10) / 10;
      let n = 0;
      for (let d = 1; d <= DIAS; d++) {
        const fecha = sumarDias(hoy, -d);
        if (d % 9 !== 0) {
          const g = gramosDia(d); const g1 = Math.round(g * 0.4);
          await bd.agregarRegistros([
            { fecha, comida: 'desayuno', alimento: platano, cantidad: g1, unidad: 'g' },
            { fecha, comida: 'comida', alimento: platano, cantidad: g - g1, unidad: 'g' },
          ]);
          n += 2;
        }
        if (d % 2 === 0) await bd.registrarPeso({ pesoKg: pesoDia(d), fecha });
      }
      return { n, pesos: (await bd.listarPesos()).length };
    }, { DIAS, hoy });
    nota(`sembrados con la API de src/bd: ${res.n} registros y ${res.pesos} pesos en ${Date.now() - t0} ms`);

    // ── Estadísticas en la UI vs cálculo independiente ──
    for (const [boton, dias] of [['7 días', 7], ['30 días', 30], ['3 meses', 90]]) {
      await p.goto(`${DEV}#/estadisticas`);
      await p.getByRole('radio', { name: boton }).click();
      await p.waitForTimeout(700);
      const texto = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
      if (process.env.DEPURAR) console.log(texto.slice(0, 700));
      const e = esperado(hoy, dias);
      const prom = num(texto.match(/Promedio diario ([\d,]+) ?kcal/)?.[1]);
      const reg = texto.match(/Días registrados (\d+) ?de (\d+)/);
      const cum = num(texto.match(/Cumplimiento (\d+) %/)?.[1]);
      const cumN = texto.match(/(\d+) de (\d+) días? a ±10 %/);
      const racha = num(texto.match(/Racha más larga (\d+)/)?.[1]);
      const rachaAct = num(texto.match(/Racha actual: (\d+)/)?.[1]);
      const metaP = num(texto.match(/Meta: ([\d,]+) kcal/)?.[1]);
      ok(`estadísticas ${boton}: promedio ${Math.round(e.promedio)} kcal`, prom === Math.round(e.promedio), prom);
      ok(`estadísticas ${boton}: días registrados ${e.diasRegistrados} de ${e.diasPeriodo}`, Number(reg?.[1]) === e.diasRegistrados && Number(reg?.[2]) === e.diasPeriodo, reg?.[0]);
      ok(`estadísticas ${boton}: cumplimiento ${e.cumplidos}/${e.conMeta} = ${Math.round(e.cumplimiento * 100)} %`, cum === Math.round(e.cumplimiento * 100) && Number(cumN?.[1]) === e.cumplidos && Number(cumN?.[2]) === e.conMeta, `${cum} % (${cumN?.[0]})`);
      ok(`estadísticas ${boton}: meta promedio ${Math.round(e.metaProm)} (historial de metas)`, metaP === Math.round(e.metaProm), metaP);
      ok(`estadísticas ${boton}: racha más larga ${e.rachaMax}, actual ${e.rachaActual}`, racha === e.rachaMax && rachaAct === e.rachaActual, `${racha} / ${rachaAct}`);
      await cap(p, `historial-estadisticas-${dias}`);
    }

    // ── Peso: promedios semanales (lunes–domingo) y mensuales ──
    const pesos = [];
    for (let d = 2; d <= DIAS; d += 2) pesos.push({ f: sumarDias(hoy, -d), kg: pesoDia(d) });
    const lunes = (f) => { const x = new Date(`${f}T12:00:00Z`); const w = (x.getUTCDay() + 6) % 7; return sumarDias(f, -w); };
    const agrupar = (clave) => { const m = new Map(); for (const x of pesos) { const k = clave(x.f); m.set(k, [...(m.get(k) ?? []), x.kg]); } return [...m].sort((a, c) => (a[0] < c[0] ? 1 : -1)).map(([k, l]) => [k, l.reduce((s, v) => s + v, 0) / l.length]); };
    const semanas = agrupar(lunes); const meses = agrupar((f) => f.slice(0, 7));
    await p.goto(`${DEV}#/peso`);
    await p.getByText('Promedios').first().waitFor();
    const lista = async () => (await p.locator('[aria-labelledby="titulo-promedios"]').innerText()).replace(/\s+/g, ' ');
    const tSem = await lista();
    if (process.env.DEPURAR) console.log(tSem.slice(0, 500));
    const promsUI = [...tSem.matchAll(/Semana del \d+ \w+ \d+ registros? ([\d.]+) kg/g)].map((m) => Number(m[1]));
    ok('peso: promedios semanales (lunes–domingo) = cálculo independiente', promsUI.length > 0 && promsUI.every((v, i) => Math.abs(v - semanas[i][1]) < 0.051), `UI ${promsUI.slice(0, 5).join(', ')} | esperado ${semanas.slice(0, 5).map((s) => s[1].toFixed(1)).join(', ')}`);
    await p.getByRole('radio', { name: 'Mes' }).click();
    await p.waitForTimeout(300);
    const tMes = await lista();
    const promsMes = [...tMes.matchAll(/(\w+) (\d{4}) \d+ registros? ([\d.]+) kg/g)].map((m) => Number(m[3]));
    ok('peso: promedios mensuales = cálculo independiente', promsMes.length === meses.length && promsMes.every((v, i) => Math.abs(v - meses[i][1]) < 0.051), `UI ${promsMes.join(', ')} | esperado ${meses.map((s) => s[1].toFixed(2)).join(', ')}`);
    await cap(p, 'historial-peso');

    // ── Calendario ──
    await p.goto(`${DEV}#/calendario`);
    await p.getByText('Resumen del mes').waitFor();
    const celdas = await p.locator('[role="grid"] button[aria-label]').evaluateAll((l) => l.map((b) => b.getAttribute('aria-label')));
    const conKcal = celdas.filter((c) => /\d kcal/.test(c));
    const mes = hoy.slice(0, 7);
    let esperadosMes = 0;
    for (let d = 1; d <= DIAS; d++) if (registrado(d) && sumarDias(hoy, -d).startsWith(mes)) esperadosMes++;
    ok(`calendario: ${esperadosMes} días del mes marcados con kcal`, conKcal.length === esperadosMes, `${conKcal.length}; ej.: ${conKcal[0]}`);
    const resumenMes = (await p.locator('[aria-label="Resumen del mes"]').innerText()).replace(/\s+/g, ' ');
    nota(`calendario, resumen del mes: ${resumenMes}`);
    await cap(p, 'historial-calendario');

    // ── Editar un día pasado desde el calendario/historial ──
    const fecha5 = sumarDias(hoy, -5);
    await p.goto(`${DEV}#/?fecha=${fecha5}`);
    const fila = p.getByRole('button', { name: /^Plátano, \d+ g, / }).first();
    await fila.waitFor();
    await fila.click();
    await p.getByRole('dialog').getByLabel('Cantidad', { exact: true }).fill('100');
    await p.getByRole('dialog').getByRole('button', { name: 'Guardar cambios' }).click();
    await p.getByText('Cambios guardados').first().waitFor();
    const editado = await p.evaluate(async (f) => (await (await import('/src/bd/index.ts')).registrosDelDia(f)).map((r) => ({ c: r.comida, g: r.cantidad, k: r.totales.kcal, fecha: r.fecha })), fecha5);
    ok('editar registro de un día pasado: queda en esa fecha con 100 g = 89 kcal', editado.some((r) => r.g === 100 && r.k === 89 && r.fecha === fecha5), JSON.stringify(editado));
    const total5 = editado.reduce((s, r) => s + r.k, 0);
    const consumidas = num(await p.locator('dt:text-is("Consumidas") + dd').first().innerText());
    ok('el resumen del día pasado se actualiza', consumidas === Math.round(total5), `${consumidas} / ${total5}`);
    // Mover el registro a otra comida
    await p.getByRole('button', { name: /^Plátano, 100 g, 89 kcal/ }).click();
    await p.getByRole('dialog').getByLabel('Comida', { exact: true }).selectOption('cena');
    await p.getByRole('dialog').getByRole('button', { name: 'Guardar cambios' }).click();
    await p.getByText('Cambios guardados').first().waitFor();
    const movido = await p.evaluate(async (f) => (await (await import('/src/bd/index.ts')).registrosDelDia(f)).filter((r) => r.cantidad === 100).map((r) => r.comida), fecha5);
    ok('mover un registro pasado a otra comida', movido[0] === 'cena', movido.join());
    await cap(p, 'historial-dia-pasado');
    await b.close();
  } finally {
    try { process.kill(-dev.pid); } catch { /* ya terminó */ }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { resumen } = await import('./comun.mjs');
  await probarHistorial();
  process.exit(resumen() ? 1 : 0);
}
