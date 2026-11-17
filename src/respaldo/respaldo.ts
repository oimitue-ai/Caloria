/**
 * Respaldo completo en JSON (opcionalmente comprimido con gzip) e importación validada.
 *
 * Formato:
 * {
 *   formato: 'caloria-respaldo', version: <VERSION_ESQUEMA>, app: 'CALORÍA', creado: ISO,
 *   conteos: { registros: n, … },
 *   suma: { algoritmo: 'SHA-256', valor: hex },   // sobre el JSON canónico de `datos`
 *   datos: { perfil, config, metas, registros, alimentosUsuario, recetas, pesos, usos, favoritos, cacheAlimentos }
 * }
 * JSON canónico = claves de objetos ordenadas, sin espacios; detecta archivos dañados o editados.
 */
import { gunzipSync, gzipSync } from 'fflate';
import type { z } from 'zod';
import type { Configuracion, Metas, Perfil, Receta, RegistroComida, RegistroPeso, Alimento } from '../tipos';
import { ahoraISO, fechaLocal } from '../nucleo/fechas';
import { bd, CLAVE_UNICA, TABLAS, VERSION_ESQUEMA } from '../bd/esquema';
import type { NombreTabla } from '../bd/esquema';
import { marcarRespaldo } from '../bd/perfil';
import { sincronizarPerfilConPesos } from '../bd/pesos';
import type { AlimentoEnCache, Favorito, UsoAlimento } from '../bd/tipos';
import {
  describirErrores, esquemaAlimento, esquemaCache, esquemaConfig, esquemaFavorito, esquemaMetas, esquemaPerfil,
  esquemaPeso, esquemaReceta, esquemaRegistro, esquemaUso,
} from '../bd/validacion';

export const FORMATO_RESPALDO = 'caloria-respaldo';

export interface DatosRespaldo {
  perfil: Perfil | null;
  config: Configuracion | null;
  metas: Metas[];
  registros: RegistroComida[];
  alimentosUsuario: Alimento[];
  recetas: Receta[];
  pesos: RegistroPeso[];
  usos: UsoAlimento[];
  favoritos: Favorito[];
  cacheAlimentos: AlimentoEnCache[];
}

export interface SumaVerificacion { algoritmo: 'SHA-256' | 'FNV-1a'; valor: string }

export interface Respaldo {
  formato: typeof FORMATO_RESPALDO;
  version: number;
  app: 'CALORÍA';
  creado: string;
  conteos: Record<NombreTabla, number>;
  suma: SumaVerificacion;
  datos: DatosRespaldo;
}

export type ModoImportacion = 'reemplazar' | 'combinar';

export interface ResultadoImportacion {
  modo: ModoImportacion;
  agregados: Record<NombreTabla, number>;
  /** ya existían (combinar) y se conservó la versión del dispositivo */
  omitidos: Record<NombreTabla, number>;
}

export type ResultadoLectura =
  | { ok: true; respaldo: Respaldo; conteos: Record<NombreTabla, number> }
  | { ok: false; error: string };

// ───────────── JSON canónico y suma de verificación ─────────────

function ordenar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) o[k] = ordenar(x);
    }
    return o;
  }
  return v;
}

/** JSON con claves ordenadas (independiente del orden de inserción). */
export function jsonCanonico(v: unknown): string {
  return JSON.stringify(ordenar(v));
}

function fnv1a(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let h = 0x811c9dc5;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

async function sha256(texto: string): Promise<string | null> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) return null;
  const hash = await subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 del JSON canónico (FNV-1a si el navegador no tiene `crypto.subtle`). */
export async function calcularSuma(datos: DatosRespaldo, algoritmo?: SumaVerificacion['algoritmo']): Promise<SumaVerificacion> {
  const texto = jsonCanonico(datos);
  if (algoritmo !== 'FNV-1a') {
    const h = await sha256(texto);
    if (h) return { algoritmo: 'SHA-256', valor: h };
    if (algoritmo === 'SHA-256') throw new Error('Este navegador no puede calcular SHA-256.');
  }
  return { algoritmo: 'FNV-1a', valor: fnv1a(texto) };
}

// ───────────── Exportar ─────────────

function contar(d: DatosRespaldo): Record<NombreTabla, number> {
  const c = {} as Record<NombreTabla, number>;
  for (const t of TABLAS) {
    const v = d[t];
    c[t] = Array.isArray(v) ? v.length : v ? 1 : 0;
  }
  return c;
}

/** Lee todas las tablas en una sola transacción (instantánea coherente). */
export async function leerDatos(): Promise<DatosRespaldo> {
  const b = bd();
  return b.transaction('r', TABLAS.map((t) => b.table(t)), async () => ({
    perfil: (await b.perfil.get(CLAVE_UNICA)) ?? null,
    config: (await b.config.get(CLAVE_UNICA)) ?? null,
    metas: await b.metas.toArray(),
    registros: await b.registros.toArray(),
    alimentosUsuario: await b.alimentosUsuario.toArray(),
    recetas: await b.recetas.toArray(),
    pesos: await b.pesos.toArray(),
    usos: await b.usos.toArray(),
    favoritos: await b.favoritos.toArray(),
    cacheAlimentos: await b.cacheAlimentos.toArray(),
  }));
}

export async function crearRespaldo(): Promise<Respaldo> {
  const datos = await leerDatos();
  return {
    formato: FORMATO_RESPALDO,
    version: VERSION_ESQUEMA,
    app: 'CALORÍA',
    creado: ahoraISO(),
    conteos: contar(datos),
    suma: await calcularSuma(datos),
    datos,
  };
}

export interface OpcionesExportarRespaldo {
  /** anota la fecha en `config.ultimoRespaldo` (por defecto true) */
  marcarFecha?: boolean;
  /** gzip (.json.gz); por defecto false */
  comprimir?: boolean;
}

/** Respaldo listo para descargar. */
export async function exportarRespaldoJSON(opciones: OpcionesExportarRespaldo = {}): Promise<{
  blob: Blob; bytes: Uint8Array; nombreArchivo: string; respaldo: Respaldo;
}> {
  const respaldo = await crearRespaldo();
  const texto = JSON.stringify(respaldo);
  let bytes: Uint8Array = new TextEncoder().encode(texto);
  if (opciones.comprimir) bytes = gzipSync(bytes, { level: 9 });
  const fecha = fechaLocal(new Date(respaldo.creado));
  const nombreArchivo = `caloria-respaldo-${fecha}.json${opciones.comprimir ? '.gz' : ''}`;
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: opciones.comprimir ? 'application/gzip' : 'application/json' });
  if (opciones.marcarFecha !== false) await marcarRespaldo(respaldo.creado);
  return { blob, bytes, nombreArchivo, respaldo };
}

// ───────────── Leer y validar ─────────────

const ESQUEMAS_LISTA: Record<Exclude<NombreTabla, 'perfil' | 'config'>, z.ZodType<unknown>> = {
  metas: esquemaMetas,
  registros: esquemaRegistro,
  alimentosUsuario: esquemaAlimento,
  recetas: esquemaReceta,
  pesos: esquemaPeso,
  usos: esquemaUso,
  favoritos: esquemaFavorito,
  cacheAlimentos: esquemaCache,
};

/**
 * Migraciones de respaldos antiguos: `MIGRACIONES_RESPALDO[v]` transforma datos de la
 * versión v a la v+1. (Vacío mientras solo exista la versión 1.)
 */
const MIGRACIONES_RESPALDO: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {};

/** Valida (zod) y limpia todas las tablas. Lanza Error con un mensaje en español. */
export function validarDatos(datos: unknown): DatosRespaldo {
  if (!datos || typeof datos !== 'object') throw new Error('El respaldo no contiene datos.');
  const d = datos as Record<string, unknown>;
  const r = {} as Record<string, unknown>;
  for (const t of ['perfil', 'config'] as const) {
    if (d[t] === null || d[t] === undefined) { r[t] = null; continue; }
    const v = (t === 'perfil' ? esquemaPerfil : esquemaConfig).safeParse(d[t]);
    if (!v.success) throw new Error(`Datos inválidos en ${t}: ${describirErrores(v.error)}`);
    r[t] = v.data;
  }
  for (const [t, esquema] of Object.entries(ESQUEMAS_LISTA)) {
    const lista = d[t] ?? [];
    if (!Array.isArray(lista)) throw new Error(`Datos inválidos: "${t}" debe ser una lista.`);
    r[t] = lista.map((x, i) => {
      const v = esquema.safeParse(x);
      if (!v.success) throw new Error(`Datos inválidos en ${t}[${i}]: ${describirErrores(v.error)}`);
      return v.data;
    });
  }
  const pesos = r.pesos as RegistroPeso[];
  if (new Set(pesos.map((p) => p.fecha)).size !== pesos.length) {
    throw new Error('Datos inválidos: hay dos pesos con la misma fecha.');
  }
  return r as unknown as DatosRespaldo;
}

async function aTexto(entrada: string | Blob | Uint8Array | ArrayBuffer): Promise<string> {
  if (typeof entrada === 'string') return entrada;
  const bytes = entrada instanceof Uint8Array ? entrada
    : entrada instanceof ArrayBuffer ? new Uint8Array(entrada)
      : new Uint8Array(await entrada.arrayBuffer());
  const datos = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  return new TextDecoder('utf-8').decode(datos);
}

/**
 * Lee un respaldo (texto, archivo o bytes; JSON o .json.gz), comprueba formato, versión y
 * suma de verificación y valida cada registro. No modifica la BD.
 */
export async function leerRespaldo(entrada: string | Blob | Uint8Array | ArrayBuffer): Promise<ResultadoLectura> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(await aTexto(entrada));
  } catch {
    return { ok: false, error: 'El archivo no es un respaldo válido (no se pudo leer como JSON).' };
  }
  const o = crudo as Partial<Respaldo> | null;
  if (!o || typeof o !== 'object' || o.formato !== FORMATO_RESPALDO) {
    return { ok: false, error: 'El archivo no es un respaldo de CALORÍA.' };
  }
  if (typeof o.version !== 'number' || !Number.isInteger(o.version) || o.version < 1) {
    return { ok: false, error: 'El respaldo no indica una versión válida.' };
  }
  if (o.version > VERSION_ESQUEMA) {
    return { ok: false, error: `El respaldo es de una versión más nueva de la app (${o.version}). Actualiza CALORÍA e inténtalo de nuevo.` };
  }
  if (!o.suma || typeof o.suma.valor !== 'string' || (o.suma.algoritmo !== 'SHA-256' && o.suma.algoritmo !== 'FNV-1a')) {
    return { ok: false, error: 'El respaldo no tiene suma de verificación.' };
  }
  let suma: SumaVerificacion;
  try {
    suma = await calcularSuma(o.datos as DatosRespaldo, o.suma.algoritmo);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (suma.valor !== o.suma.valor) {
    return { ok: false, error: 'El respaldo está dañado o fue modificado (la suma de verificación no coincide).' };
  }
  let datosCrudos = o.datos as unknown as Record<string, unknown>;
  for (let v = o.version; v < VERSION_ESQUEMA; v++) {
    const m = MIGRACIONES_RESPALDO[v];
    if (m) datosCrudos = m(datosCrudos);
  }
  let datos: DatosRespaldo;
  try {
    datos = validarDatos(datosCrudos);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const conteos = contar(datos);
  return {
    ok: true,
    respaldo: { ...(o as Respaldo), version: VERSION_ESQUEMA, conteos, datos },
    conteos,
  };
}

// ───────────── Importar ─────────────

const ceros = (): Record<NombreTabla, number> =>
  Object.fromEntries(TABLAS.map((t) => [t, 0])) as Record<NombreTabla, number>;

function claveUso(u: Pick<UsoAlimento, 'alimentoId' | 'comida'>): string {
  return `${u.alimentoId}\u0000${u.comida}`;
}

/**
 * Importa un respaldo ya leído con `leerRespaldo`.
 *  - 'reemplazar': borra TODOS los datos del dispositivo y deja exactamente los del respaldo.
 *  - 'combinar': agrega solo lo que no existe (por id; pesos por id o fecha; metas por `desde`;
 *    recientes por alimento+comida). Lo existente no se toca. El perfil y la configuración
 *    actuales se conservan; solo se completan campos vacíos con los del respaldo.
 * Todo ocurre en una transacción: si algo falla, no se aplica nada.
 */
export async function importarRespaldo(respaldo: Respaldo, modo: ModoImportacion): Promise<ResultadoImportacion> {
  const datos = validarDatos(respaldo.datos);
  const b = bd();
  const agregados = ceros();
  const omitidos = ceros();

  await b.transaction('rw', TABLAS.map((t) => b.table(t)), async () => {
    if (modo === 'reemplazar') {
      for (const t of TABLAS) await b.table(t).clear();
      if (datos.perfil) { await b.perfil.put(datos.perfil, CLAVE_UNICA); agregados.perfil = 1; }
      if (datos.config) { await b.config.put(datos.config, CLAVE_UNICA); agregados.config = 1; }
      for (const t of TABLAS) {
        if (t === 'perfil' || t === 'config') continue;
        const lista = datos[t] as unknown[];
        await b.table(t).bulkAdd(lista);
        agregados[t] = lista.length;
      }
      return;
    }

    // combinar
    const perfilActual = await b.perfil.get(CLAVE_UNICA);
    if (datos.perfil) {
      const mezcla = { ...datos.perfil, ...(perfilActual ?? {}) };
      await b.perfil.put(mezcla, CLAVE_UNICA);
      if (!perfilActual) agregados.perfil = 1; else omitidos.perfil = 1;
    }
    const configActual = await b.config.get(CLAVE_UNICA);
    if (datos.config) {
      const mezcla: Configuracion = { ...datos.config, ...(configActual ?? {}) };
      const u = [configActual?.ultimoRespaldo, datos.config.ultimoRespaldo].filter((x): x is string => !!x).sort();
      if (u.length) mezcla.ultimoRespaldo = u[u.length - 1];
      await b.config.put(mezcla, CLAVE_UNICA);
      if (!configActual) agregados.config = 1; else omitidos.config = 1;
    }

    const porId = async <T>(t: NombreTabla, lista: T[], clave: (x: T) => string, extra?: (x: T) => boolean) => {
      const existentes = new Set((await b.table(t).toCollection().primaryKeys()).map((k) =>
        (Array.isArray(k) ? (k as unknown as string[]).join('\u0000') : String(k))));
      const nuevos: T[] = [];
      for (const x of lista) {
        const k = clave(x);
        if (existentes.has(k) || (extra && extra(x))) { omitidos[t]++; continue; }
        existentes.add(k);
        nuevos.push(x);
      }
      await b.table(t).bulkAdd(nuevos);
      agregados[t] = nuevos.length;
    };

    const fechasPeso = new Set((await b.pesos.orderBy('fecha').keys()).map(String));

    await porId('metas', datos.metas, (m) => m.desde);
    await porId('registros', datos.registros, (r) => r.id);
    await porId('alimentosUsuario', datos.alimentosUsuario, (a) => a.id);
    await porId('recetas', datos.recetas, (r) => r.id);
    await porId('pesos', datos.pesos, (p) => p.id, (p) => {
      if (fechasPeso.has(p.fecha)) return true;
      fechasPeso.add(p.fecha);
      return false;
    });
    await porId('usos', datos.usos, claveUso);
    await porId('favoritos', datos.favoritos, (f) => f.alimentoId);
    await porId('cacheAlimentos', datos.cacheAlimentos, (c) => c.id);
    await sincronizarPerfilConPesos();
  });

  return { modo, agregados, omitidos };
}
