/**
 * Exportación CSV (UTF-8 con BOM para que Excel respete los acentos; separador coma; CRLF).
 * Campos con coma, comillas, saltos de línea o espacios al borde van entre comillas dobles y
 * las comillas internas se duplican (RFC 4180). Los textos que empiezan con = + - @ se
 * prefijan con ' para que una hoja de cálculo no los ejecute como fórmula.
 */
import type { RegistroComida, RegistroPeso } from '../tipos';
import { COMIDAS } from '../tipos';
import { redondear } from '../nucleo/calculo';
import { hoy } from '../nucleo/fechas';
import { serieTendencia } from '../nucleo/peso';
import { NOMBRE_UNIDAD } from '../nucleo/unidades';
import { registrosEnRango } from '../bd/registros';
import { listarPesos } from '../bd/pesos';

export const BOM = '﻿';
const SALTO = '\r\n';

export type Celda = string | number | null | undefined;

/** Escapa un valor para CSV. Números con punto decimal; null/undefined → vacío. */
export function escaparCSV(v: Celda): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Tabla → texto CSV con BOM. */
export function aCSV(encabezados: string[], filas: Celda[][]): string {
  return BOM + [encabezados, ...filas].map((f) => f.map(escaparCSV).join(',')).join(SALTO) + SALTO;
}

const nombreComida = (id: string) => COMIDAS.find((c) => c.id === id)?.nombre ?? id;
const ordenComida = (id: string) => COMIDAS.findIndex((c) => c.id === id);
const r2 = (v: number | undefined) => (v === undefined ? undefined : redondear(v, 2));

/** Ordena por fecha, comida (orden del día) y captura. */
export function ordenarRegistros(lista: readonly RegistroComida[]): RegistroComida[] {
  return [...lista].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)
    || ordenComida(a.comida) - ordenComida(b.comida)
    || (a.creado < b.creado ? -1 : a.creado > b.creado ? 1 : 0));
}

export const ENCABEZADOS_COMIDAS = [
  'Fecha', 'Comida', 'Alimento', 'Marca', 'Cantidad', 'Unidad', 'Porción', 'Cantidad base', 'Base',
  'Calorías (kcal)', 'Proteína (g)', 'Carbohidratos (g)', 'Grasa (g)', 'Grasa saturada (g)', 'Fibra (g)',
  'Azúcares (g)', 'Sodio (mg)', 'Fuente',
];

export function filaComida(r: RegistroComida): Celda[] {
  const t = r.totales;
  return [
    r.fecha, nombreComida(r.comida), r.instantanea.nombre, r.instantanea.marca, r.cantidad,
    NOMBRE_UNIDAD[r.unidad]?.abreviatura ?? r.unidad, r.porcionEtiqueta, r2(r.cantidadBase), r.instantanea.base,
    r2(t.kcal), r2(t.proteina), r2(t.carbohidratos), r2(t.grasa), r2(t.grasaSaturada), r2(t.fibra), r2(t.azucares),
    r2(t.sodio), r.instantanea.fuente,
  ];
}

/** CSV de comidas (una fila por alimento registrado). Valores con 2 decimales. */
export function comidasACSV(registros: readonly RegistroComida[]): string {
  return aCSV(ENCABEZADOS_COMIDAS, ordenarRegistros(registros).map(filaComida));
}

/** CSV de peso con media móvil de 7 días y tendencia. */
export function pesosACSV(pesos: readonly RegistroPeso[]): string {
  const serie = new Map(serieTendencia(pesos).map((p) => [p.fecha, p]));
  const filas = [...pesos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map((p) => {
    const s = serie.get(p.fecha);
    return [p.fecha, p.pesoKg, s ? redondear(s.mediaMovilKg, 2) : undefined, s ? redondear(s.tendenciaKg, 2) : undefined, p.nota];
  });
  return aCSV(['Fecha', 'Peso (kg)', 'Media móvil 7 días (kg)', 'Tendencia (kg)', 'Nota'], filas);
}

const blobCSV = (texto: string) => new Blob([texto], { type: 'text/csv;charset=utf-8' });

/** CSV de comidas del rango (por defecto todo el historial). */
export async function exportarComidasCSV(desde = '0000-01-01', hasta = '9999-12-31'): Promise<{ blob: Blob; texto: string; nombreArchivo: string }> {
  const texto = comidasACSV(await registrosEnRango(desde, hasta));
  return { blob: blobCSV(texto), texto, nombreArchivo: `caloria-comidas-${hoy()}.csv` };
}

export async function exportarPesoCSV(): Promise<{ blob: Blob; texto: string; nombreArchivo: string }> {
  const texto = pesosACSV(await listarPesos());
  return { blob: blobCSV(texto), texto, nombreArchivo: `caloria-peso-${hoy()}.csv` };
}

/**
 * Lector CSV mínimo (RFC 4180) para comprobar exportaciones: quita el BOM y respeta comillas.
 */
export function leerCSV(texto: string): string[][] {
  const s = texto.startsWith(BOM) ? texto.slice(1) : texto;
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (comillas) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; } else if (c === '\r' && s[i + 1] === '\n') {
      fila.push(campo); filas.push(fila); fila = []; campo = ''; i++;
    } else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}
