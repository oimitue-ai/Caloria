// Secciones 8 y 10: escritorio 1440×900 y Android 412×915 (touch) — desbordes, superposición de textos,
// capturas (revisadas a mano) y accesibilidad con axe-core (WCAG 2 A/AA) en cada pantalla.
import { cpSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { BASE, SALIDA, ok, nota, cap, vigilar, abrirPersistente, ESCRITORIO, MOVIL } from './comun.mjs';
import { PERFIL_DIR } from './registro.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');

/** Violaciones ya documentadas como PENDIENTES en docs/AUDITORIA.md (decisión de diseño de color / etiquetas):
 *  se informan como nota y no hacen fallar la suite. Cualquier otra violación grave/crítica sí falla. */
const PENDIENTES_AXE = new Set(['color-contrast', 'label-content-name-mismatch']);
const graves = (v) => v.filter((x) => /critical|serious/.test(x.impacto) && !PENDIENTES_AXE.has(x.id));
const pendientes = [];

const RUTAS = [
  ['#/', 'dia'], ['#/calendario', 'calendario'], ['#/peso', 'peso'], ['#/estadisticas', 'estadisticas'], ['#/mas', 'mas'],
  ['#/mas/perfil', 'perfil'], ['#/mas/recetas', 'recetas'], ['#/mas/alimentos', 'mis-alimentos'], ['#/mas/alimentos/nuevo', 'nuevo-alimento'],
  ['#/mas/respaldo', 'respaldo'], ['#/mas/fuentes', 'fuentes'], ['#/mas/acerca', 'acerca'],
];

/** Desbordes horizontales y textos encimados (heurística sobre hojas de texto visibles). */
function revisarDisposicion() {
  const vw = document.documentElement.clientWidth;
  const res = { scrollX: document.documentElement.scrollWidth > vw + 1, fuera: [], encimados: [] };
  const dentroDeScroll = (el) => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll|hidden)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1) return true; } return false; };
  const hojas = [];
  const modal = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter((d) => d.getBoundingClientRect().height > 0).pop();
  const posFija = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const ps = getComputedStyle(e).position; if (ps === 'fixed' || ps === 'sticky') return e; } return null; };
  for (const el of (modal ?? document.body).querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
    if (el.closest('.sr-only, [aria-hidden="true"] svg')) continue;
    if ((r.right > vw + 1 || r.left < -1) && !dentroDeScroll(el)) res.fuera.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} [${Math.round(r.left)}–${Math.round(r.right)}]`);
    const texto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (texto && !el.closest('svg')) hojas.push({ el, r, fijo: posFija(el) });
  }
  for (let i = 0; i < hojas.length && i < 600; i++) for (let j = i + 1; j < hojas.length && j < 600; j++) {
    const a = hojas[i]; const b = hojas[j];
    if (a.fijo !== b.fijo && !modal) continue; // capas fijas (barra, avisos) sobre el contenido desplazable: esperable
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (x > 3 && y > 3) res.encimados.push(`"${a.el.textContent.trim().slice(0, 25)}" × "${b.el.textContent.trim().slice(0, 25)}"`);
  }
  res.fuera = res.fuera.slice(0, 5);
  res.encimados = res.encimados.slice(0, 5);
  return res;
}

async function axe(p) {
  if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ path: AXE });
  return p.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return r.violations.map((v) => ({ id: v.id, impacto: v.impact, n: v.nodes.length, ej: v.nodes[0]?.target?.join(' ') }));
  });
}

export async function probarPantallas() {
  // copia del perfil con datos reales de la sección 1 (para no alterarlo)
  const dir = '/tmp/caloria-auditoria/perfil-pantallas';
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  cpSync(PERFIL_DIR, dir, { recursive: true });
  const axeTodo = {};
  for (const [nombre, disp] of [['movil', MOVIL], ['escritorio', ESCRITORIO]]) {
    const ctx = await abrirPersistente(dir, disp);
    const p = ctx.pages()[0] ?? await ctx.newPage();
    vigilar(p, nombre);
    await p.goto(BASE);
    await p.waitForTimeout(1500);
    if (await p.getByRole('button', { name: 'Después' }).count()) { nota(`${nombre}: aviso "Nueva versión disponible" visible (perfil con SW anterior); se descarta con "Después"`); await p.getByRole('button', { name: 'Después' }).click(); }
    for (const tema of ['claro', 'oscuro']) {
      if (tema === 'oscuro') { await p.goto(`${BASE}#/mas`); await p.getByRole('radio', { name: 'Oscuro' }).click(); }
      for (const [ruta, id] of RUTAS) {
        if (tema === 'oscuro' && !['dia', 'estadisticas', 'mas'].includes(id)) continue;
        await p.goto(`${BASE}${ruta}`);
        await p.waitForLoadState('networkidle').catch(() => {});
        await p.waitForTimeout(700);
        const d = await p.evaluate(revisarDisposicion);
        ok(`${nombre}/${tema} ${ruta}: sin desborde horizontal ni textos encimados`, !d.scrollX && !d.fuera.length && !d.encimados.length, [d.scrollX ? 'scrollX' : '', ...d.fuera, ...d.encimados].filter(Boolean).join(' ; '));
        await cap(p, `${nombre}-${tema}-${id}`);
        if (tema === 'claro') {
          const v = await axe(p);
          axeTodo[`${nombre} ${ruta}`] = v;
          ok(`axe ${nombre} ${ruta}: sin violaciones graves/críticas (fuera de las pendientes documentadas)`, graves(v).length === 0, v.map((x) => `${x.id}(${x.impacto},${x.n}) ${x.ej}`).join(' ; '));
        }
      }
      // hoja de registro con resultados y panel de cantidad
      await p.goto(`${BASE}#/`);
      await p.getByRole('button', { name: 'Agregar a Comida', exact: true }).click();
      await p.getByRole('searchbox', { name: 'Buscar alimento' }).fill('tortilla de maíz');
      await p.locator('[aria-label="Resultados del catálogo"] > li').first().waitFor();
      await p.waitForTimeout(500);
      let d = await p.evaluate(revisarDisposicion);
      ok(`${nombre}/${tema} hoja de registro con resultados`, !d.scrollX && !d.fuera.length && !d.encimados.length, [...d.fuera, ...d.encimados].join(' ; '));
      await cap(p, `${nombre}-${tema}-hoja-resultados`);
      if (tema === 'claro') { const v = await axe(p); axeTodo[`${nombre} hoja`] = v; ok(`axe ${nombre} hoja de registro: sin graves (fuera de pendientes)`, graves(v).length === 0, v.map((x) => `${x.id}(${x.impacto},${x.n}) ${x.ej}`).join(' ; ')); }
      await p.locator('[aria-label="Resultados del catálogo"] > li button').first().click();
      await p.getByRole('dialog').getByText('Vas a agregar').waitFor();
      d = await p.evaluate(revisarDisposicion);
      ok(`${nombre}/${tema} panel de cantidad`, !d.scrollX && !d.fuera.length && !d.encimados.length, [...d.fuera, ...d.encimados].join(' ; '));
      await cap(p, `${nombre}-${tema}-panel-cantidad`);
      if (tema === 'claro') { const v = await axe(p); axeTodo[`${nombre} panel`] = v; ok(`axe ${nombre} panel de cantidad: sin graves (fuera de pendientes)`, graves(v).length === 0, v.map((x) => `${x.id}(${x.impacto},${x.n}) ${x.ej}`).join(' ; ')); }
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
    }
    await p.goto(`${BASE}#/mas`); await p.getByRole('radio', { name: 'Sistema' }).click();
    await ctx.close();
  }
  writeFileSync(join(SALIDA, 'axe.json'), JSON.stringify(axeTodo, null, 1));
  for (const [k, v] of Object.entries(axeTodo)) for (const x of v) if (PENDIENTES_AXE.has(x.id)) pendientes.push(`${k}: ${x.id} ×${x.n}`);
  nota(`axe PENDIENTES (documentadas): ${pendientes.join(' ; ') || 'ninguna'}`);
  const menores = Object.entries(axeTodo).flatMap(([k, v]) => v.filter((x) => !/critical|serious/.test(x.impacto)).map((x) => `${k}: ${x.id}(${x.impacto})`));
  nota(`axe moderadas/menores: ${menores.length ? menores.join(' ; ') : 'ninguna'}`);
  void dirname;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { resumen } = await import('./comun.mjs');
  await probarPantallas();
  process.exit(resumen() ? 1 : 0);
}
