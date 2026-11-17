// Utilidades compartidas de la auditoría E2E (Agente 4). Sin dependencias fuera de playwright.
import { chromium } from 'playwright';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const RAIZ = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
export const BASE = process.env.BASE ?? 'http://localhost:4173/';
export const CAP = join(RAIZ, 'pruebas', 'capturas', 'auditoria');
export const SALIDA = join(RAIZ, 'pruebas', 'salida');
export const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome';
mkdirSync(CAP, { recursive: true });
mkdirSync(SALIDA, { recursive: true });

export const resultados = [];
export const errores = [];
let seccion = '';
export function enSeccion(n) { seccion = n; console.log(`\n=== ${n} ===`); }
export function ok(nombre, cond, extra = '') {
  resultados.push({ seccion, nombre, ok: !!cond, extra: String(extra) });
  console.log(`${cond ? 'OK   ' : 'FALLA'} ${nombre}${extra !== '' ? `  — ${extra}` : ''}`);
  return !!cond;
}
export function nota(texto) { console.log(`     · ${texto}`); resultados.push({ seccion, nombre: texto, ok: true, nota: true, extra: '' }); }

export function vigilar(p, etiqueta = '') {
  p.on('pageerror', (e) => errores.push(`${etiqueta} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errores.push(`${etiqueta} console: ${m.text()}`); });
  p.on('dialog', (d) => { errores.push(`${etiqueta} dialog inesperado: ${d.type()} ${d.message()}`); d.dismiss().catch(() => {}); });
}

export const MOVIL = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
export const ESCRITORIO = { viewport: { width: 1440, height: 900 } };
const COMUNES = { locale: 'es-MX', timezoneId: 'America/Mexico_City', acceptDownloads: true };

/** Contexto persistente con userDataDir (sobrevive a cerrar el navegador). */
export async function abrirPersistente(dir, opciones = MOVIL, limpiar = false) {
  if (limpiar && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, args: ['--no-sandbox'], ...COMUNES, ...opciones });
}

export async function abrirNavegador() {
  return chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
}
export const opcionesContexto = (o = MOVIL) => ({ ...COMUNES, ...o });

export async function cap(p, nombre) {
  await p.waitForTimeout(300);
  const ruta = join(CAP, `${nombre}.png`);
  await p.screenshot({ path: ruta });
  return ruta;
}

/** Completa el asistente con un perfil fijo (H, 34 a, 172 cm, 82 kg → 76 kg, moderado, bajar). */
export async function completarAsistente(p) {
  await p.goto(BASE);
  await p.waitForURL(/#\/bienvenida/, { timeout: 15000 });
  await p.getByRole('button', { name: 'Configurar mi meta' }).click();
  await p.getByRole('radio', { name: 'Hombre' }).click();
  await p.getByLabel('Edad').fill('34');
  await p.getByLabel('Estatura').fill('172');
  await p.getByLabel('Peso actual').fill('82');
  await p.getByLabel('Peso objetivo').fill('76');
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByLabel('Nivel de actividad').selectOption('moderado');
  await p.getByRole('radio', { name: 'Bajar' }).click();
  await p.getByRole('button', { name: 'Continuar' }).click();
  const texto = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  await p.getByRole('button', { name: 'Guardar y empezar' }).click();
  await p.waitForURL(/#\/$/);
  await p.getByText('kcal restantes').waitFor();
  return texto;
}

/** Fecha local YYYY-MM-DD (zona de México) desplazada n días. */
export function fechaMx(n = 0) {
  const s = new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  return s;
}

/** Número es-MX ("2,131" → 2131; "12.5" → 12.5). */
export const num = (t) => Number(String(t).replace(/[^\d.,-]/g, '').replace(/,/g, ''));

/** Lee filas del índice base publicado. */
let _base = null;
export function filasBase() {
  if (_base) return _base;
  const man = JSON.parse(readFileSync(join(RAIZ, 'public/catalogo/manifiesto.json'), 'utf8'));
  _base = man.base.indices.flatMap((f) => JSON.parse(readFileSync(join(RAIZ, 'public/catalogo/base', f), 'utf8')).filas);
  return _base;
}

export function resumen() {
  const fallas = resultados.filter((r) => !r.ok);
  const total = resultados.filter((r) => !r.nota);
  console.log('\nErrores de consola/página:', errores.length ? `\n  ${[...new Set(errores)].join('\n  ')}` : 'ninguno');
  console.log(`\n${total.length - fallas.length}/${total.length} comprobaciones OK`);
  if (fallas.length) console.log('Fallas:\n' + fallas.map((f) => `  [${f.seccion}] ${f.nombre} ${f.extra}`).join('\n'));
  return fallas.length;
}
