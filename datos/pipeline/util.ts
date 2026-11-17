import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import type { Readable } from 'node:stream';

export const RAIZ_DATOS = resolve(dirname(new URL(import.meta.url).pathname), '..');
export const RAIZ_PROYECTO = resolve(RAIZ_DATOS, '..');
export const CRUDOS = join(RAIZ_DATOS, 'crudos');
export const ESPEJOS = join(CRUDOS, '_espejos');
export const SALIDA = join(RAIZ_DATOS, 'salida');
export const INTERMEDIO = join(SALIDA, 'intermedio');
export const CATALOGO = join(RAIZ_PROYECTO, 'public', 'catalogo');

export function asegurarDir(d: string) {
  mkdirSync(d, { recursive: true });
}

export function log(...a: unknown[]) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}]`, ...a);
}

/** Redondeo a n decimales; undefined/NaN → undefined (faltante ≠ 0). */
export function r(v: unknown, n = 2): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const x = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(x)) return undefined;
  const f = 10 ** n;
  return Math.round(x * f) / f;
}

/** Escritor NDJSON con contrapresión. */
export class EscritorNdjson {
  private s: ReturnType<typeof createWriteStream>;
  n = 0;
  constructor(ruta: string) {
    asegurarDir(dirname(ruta));
    this.s = createWriteStream(ruta);
  }
  async escribir(obj: unknown) {
    this.n++;
    if (!this.s.write(JSON.stringify(obj) + '\n')) await once(this.s, 'drain');
  }
  async cerrar() {
    this.s.end();
    await once(this.s, 'finish');
  }
}

export async function* leerNdjson<T = any>(ruta: string): AsyncGenerator<T> {
  const rl = createInterface({ input: createReadStream(ruta), crlfDelay: Infinity });
  for await (const l of rl) if (l) yield JSON.parse(l) as T;
}

/** Lector de líneas desde un stream. */
export async function* lineas(input: Readable): AsyncGenerator<string> {
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const l of rl) yield l;
}

/** Parser CSV (RFC 4180) en streaming; devuelve objetos por encabezado. */
export async function* leerCsv(input: Readable | string, sep = ','): AsyncGenerator<Record<string, string>> {
  const stream = typeof input === 'string' ? createReadStream(input) : input;
  let encabezado: string[] | null = null;
  let campo = '';
  let fila: string[] = [];
  let enComillas = false;
  let pendientes: Record<string, string>[] = [];
  const cerrarFila = () => {
    fila.push(campo);
    campo = '';
    if (!encabezado) encabezado = fila.map((h) => h.replace(/^﻿/, ''));
    else if (fila.length > 1 || fila[0] !== '') {
      const o: Record<string, string> = {};
      for (let i = 0; i < encabezado.length; i++) o[encabezado[i]] = fila[i] ?? '';
      pendientes.push(o);
    }
    fila = [];
  };
  let resto = '';
  const decod = new TextDecoder('utf-8');
  const procesar = (s: string) => {
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (enComillas) {
        if (c === '"') {
          if (s[i + 1] === '"') {
            campo += '"';
            i += 2;
            continue;
          }
          enComillas = false;
          i++;
          continue;
        }
        const j = s.indexOf('"', i);
        if (j === -1) {
          campo += s.slice(i);
          i = s.length;
        } else {
          campo += s.slice(i, j);
          i = j;
        }
        continue;
      }
      if (c === '"' && campo === '') {
        enComillas = true;
        i++;
      } else if (c === sep) {
        fila.push(campo);
        campo = '';
        i++;
      } else if (c === '\n') {
        cerrarFila();
        i++;
      } else if (c === '\r') {
        i++;
      } else {
        campo += c;
        i++;
      }
    }
  };
  for await (const trozo of stream as AsyncIterable<Buffer | string>) {
    // una comilla al final del trozo podría ser la mitad de un escape "": se difiere al siguiente
    let s = resto + (typeof trozo === 'string' ? trozo : decod.decode(trozo, { stream: true }));
    resto = '';
    while (s.endsWith('"')) {
      resto += '"';
      s = s.slice(0, -1);
    }
    procesar(s);
    if (pendientes.length) {
      const p = pendientes;
      pendientes = [];
      yield* p;
    }
  }
  if (resto) procesar(resto);
  if (campo !== '' || fila.length) cerrarFila();
  yield* pendientes;
}

/** TSV sin comillas (formato del volcado de Open Food Facts). */
export async function* leerTsv(input: Readable): AsyncGenerator<Record<string, string>> {
  let enc: string[] | null = null;
  for await (const l of lineas(input)) {
    const c = l.split('\t');
    if (!enc) {
      enc = c;
      continue;
    }
    const o: Record<string, string> = {};
    for (let i = 0; i < enc.length; i++) o[enc[i]] = c[i] ?? '';
    yield o;
  }
}

/** Salida estándar de `unzip -p zip miembro` (sin extraer a disco). */
export function unzipStream(zip: string, miembro: string): Readable {
  const p = spawn('unzip', ['-p', zip, miembro], { stdio: ['ignore', 'pipe', 'inherit'] });
  return p.stdout;
}

export function listarZip(zip: string): Promise<string[]> {
  return new Promise((res, rej) => {
    const p = spawn('unzip', ['-Z1', zip]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (c) => (c === 0 ? res(out.split('\n').filter(Boolean)) : rej(new Error(`unzip -Z1 ${zip}: ${c}`))));
  });
}

/** Firma barata de un archivo (tamaño + fecha de modificación) para el modo incremental. */
export function firmaArchivo(ruta: string): string {
  const s = statSync(ruta);
  return `${s.size}:${Math.floor(s.mtimeMs)}`;
}

export function sha256Archivo(ruta: string): Promise<string> {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(ruta)
      .on('data', (d) => h.update(d))
      .on('end', () => res(h.digest('hex')))
      .on('error', rej);
  });
}

export function hashTexto(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

export function leerJson<T = any>(ruta: string): T {
  return JSON.parse(readFileSync(ruta, 'utf8')) as T;
}

export function escribirJson(ruta: string, obj: unknown, bonito = false) {
  asegurarDir(dirname(ruta));
  writeFileSync(ruta, bonito ? JSON.stringify(obj, null, 2) + '\n' : JSON.stringify(obj));
}

export function existe(ruta: string) {
  return existsSync(ruta);
}

/** Contador de motivos (descartes, atípicos…). */
export class Contador {
  c: Record<string, number> = {};
  inc(k: string, n = 1) {
    this.c[k] = (this.c[k] ?? 0) + n;
  }
}

/** Fecha 'MM/DD/YYYY' o 'YYYY-MM-DD' → 'YYYY-MM-DD'. */
export function fechaIso(f: string | undefined | null): string | undefined {
  if (!f) return undefined;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(f);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(f);
  if (n) return `${n[1]}-${n[2]}-${n[3]}`;
  if (/^\d{9,11}$/.test(f)) return new Date(Number(f) * 1000).toISOString().slice(0, 10);
  return undefined;
}

/** "PRODUCT NAME, FLAVOR" → "Product name, flavor" (nombres en mayúsculas de USDA Branded). */
export function capitalizarSiMayusculas(s: string): string {
  const letras = s.replace(/[^A-Za-z]/g, '');
  if (letras.length < 4 || letras !== letras.toUpperCase()) return s.trim();
  const b = s.toLowerCase().trim();
  return b.charAt(0).toUpperCase() + b.slice(1);
}
