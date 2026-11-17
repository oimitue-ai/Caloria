/**
 * Exportación a Excel (.xlsx) con exceljs (se carga bajo demanda para no pesar en el arranque).
 * Hojas: Comidas, Resumen diario, Peso, Recetas, Alimentos propios.
 */
import type { Alimento, Receta, RegistroComida, RegistroPeso, Metas } from '../tipos';
import { calcularTotales, redondear } from '../nucleo/calculo';
import { estadisticasRango } from '../nucleo/estadisticas';
import { hoy } from '../nucleo/fechas';
import { serieTendencia } from '../nucleo/peso';
import { totalesPorPorcion, totalesReceta } from '../nucleo/recetas';
import { NOMBRE_UNIDAD } from '../nucleo/unidades';
import { listarAlimentosUsuario } from '../bd/alimentos';
import { historialMetas } from '../bd/perfil';
import { listarPesos } from '../bd/pesos';
import { listarRecetas } from '../bd/recetas';
import { registrosEnRango } from '../bd/registros';
import { ENCABEZADOS_COMIDAS, filaComida, ordenarRegistros } from './csv';
import type { Celda } from './csv';

type ExcelJS = typeof import('exceljs');
type Hoja = import('exceljs').Worksheet;

export const HOJAS_EXCEL = ['Comidas', 'Resumen diario', 'Peso', 'Recetas', 'Alimentos propios'] as const;

const r2 = (v: number | undefined | null) => (v === undefined || v === null ? undefined : redondear(v, 2));

/** Fecha civil como fecha de Excel (sin desfase de zona horaria). */
function fechaExcel(f: string): Date {
  const [a, m, d] = f.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function hoja(libro: import('exceljs').Workbook, nombre: string, encabezados: string[], filas: Celda[][] | (Celda | Date)[][], anchos?: number[]): Hoja {
  const h = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  h.addRow(encabezados);
  for (const f of filas) h.addRow(f.map((v) => (v === null ? undefined : v)));
  h.getRow(1).font = { bold: true };
  h.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
  h.columns.forEach((c, i) => { c.width = anchos?.[i] ?? Math.max(10, Math.min(40, encabezados[i].length + 2)); });
  if (filas.length) h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: encabezados.length } };
  return h;
}

function formatoFecha(h: Hoja, columna = 1): void {
  h.getColumn(columna).numFmt = 'yyyy-mm-dd';
}

export interface DatosExcel {
  registros: RegistroComida[];
  metas: Metas[];
  pesos: RegistroPeso[];
  recetas: Receta[];
  alimentosUsuario: Alimento[];
}

/** Construye el libro a partir de datos (función pura respecto a la BD). */
export async function construirLibro(d: DatosExcel): Promise<import('exceljs').Workbook> {
  const mod = (await import('exceljs')) as ExcelJS & { default?: ExcelJS };
  const Excel = mod.default ?? mod;
  const libro = new Excel.Workbook();
  libro.creator = 'CALORÍA';
  libro.created = new Date();

  // Comidas
  const comidas = ordenarRegistros(d.registros).map((r) => {
    const f: (Celda | Date)[] = filaComida(r);
    f[0] = fechaExcel(r.fecha);
    return f;
  });
  formatoFecha(hoja(libro, 'Comidas', ENCABEZADOS_COMIDAS, comidas, [12, 16, 36, 18, 10, 8, 26, 12, 6]));

  // Resumen diario (solo días con registros)
  const fechas = d.registros.map((r) => r.fecha).sort();
  const resumen: (Celda | Date)[][] = [];
  if (fechas.length) {
    const est = estadisticasRango(d.registros, d.metas, fechas[0], fechas[fechas.length - 1]);
    for (const dia of est.serie) {
      if (!dia.registrado || !dia.totales) continue;
      const t = dia.totales;
      resumen.push([
        fechaExcel(dia.fecha), dia.registros, r2(t.kcal), r2(t.proteina), r2(t.carbohidratos), r2(t.grasa),
        r2(t.fibra), r2(t.sodio), dia.meta?.kcal, dia.proporcionMeta === null ? undefined : r2(dia.proporcionMeta * 100),
        dia.cumple === null ? '—' : dia.cumple ? 'Sí' : 'No',
      ]);
    }
  }
  formatoFecha(hoja(libro, 'Resumen diario', ['Fecha', 'Alimentos registrados', 'Calorías (kcal)', 'Proteína (g)',
    'Carbohidratos (g)', 'Grasa (g)', 'Fibra (g)', 'Sodio (mg)', 'Meta (kcal)', '% de la meta', 'Cumple (±10 %)'], resumen));

  // Peso
  const serie = new Map(serieTendencia(d.pesos).map((p) => [p.fecha, p]));
  const pesos = [...d.pesos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map((p) => {
    const s = serie.get(p.fecha);
    return [fechaExcel(p.fecha), p.pesoKg, r2(s?.mediaMovilKg), r2(s?.tendenciaKg), p.nota];
  });
  formatoFecha(hoja(libro, 'Peso', ['Fecha', 'Peso (kg)', 'Media móvil 7 días (kg)', 'Tendencia (kg)', 'Nota'], pesos, [12, 10, 22, 14, 30]));

  // Recetas: una fila por ingrediente, más total y por porción
  const recetas: Celda[][] = [];
  for (const rec of d.recetas) {
    for (const ing of rec.ingredientes) {
      const t = calcularTotales(ing.instantanea.nutrientes, ing.cantidadBase);
      recetas.push([rec.nombre, rec.porciones, rec.pesoFinalG, ing.instantanea.nombre, ing.cantidad,
        NOMBRE_UNIDAD[ing.unidad]?.abreviatura ?? ing.unidad, ing.porcionEtiqueta, r2(ing.cantidadBase), ing.instantanea.base,
        r2(t.kcal), r2(t.proteina), r2(t.carbohidratos), r2(t.grasa)]);
    }
    const tot = totalesReceta(rec);
    const por = totalesPorPorcion(rec);
    recetas.push([rec.nombre, rec.porciones, rec.pesoFinalG, 'TOTAL RECETA', undefined, undefined, undefined, undefined,
      undefined, r2(tot.kcal), r2(tot.proteina), r2(tot.carbohidratos), r2(tot.grasa)]);
    recetas.push([rec.nombre, rec.porciones, rec.pesoFinalG, 'POR PORCIÓN', 1, 'porción', undefined, undefined,
      undefined, r2(por.kcal), r2(por.proteina), r2(por.carbohidratos), r2(por.grasa)]);
  }
  hoja(libro, 'Recetas', ['Receta', 'Porciones', 'Peso final (g)', 'Ingrediente', 'Cantidad', 'Unidad', 'Porción',
    'Cantidad base', 'Base', 'Calorías (kcal)', 'Proteína (g)', 'Carbohidratos (g)', 'Grasa (g)'], recetas, [28, 10, 14, 34]);

  // Alimentos propios
  const propios = d.alimentosUsuario.map((a) => {
    const n = a.nutrientes;
    return [a.nombre, a.marca, `por 100 ${a.base}`, n.kcal, n.proteina, n.carbohidratos, n.grasa, n.grasaSaturada,
      n.fibra, n.azucares, n.sodio, a.densidad,
      a.porciones.map((p) => `${p.etiqueta} = ${redondear(p.equivalencia, 2)} ${a.base}`).join('; ') || undefined,
      a.codigoBarras, a.notas];
  });
  hoja(libro, 'Alimentos propios', ['Nombre', 'Marca', 'Base', 'Calorías (kcal)', 'Proteína (g)', 'Carbohidratos (g)',
    'Grasa (g)', 'Grasa saturada (g)', 'Fibra (g)', 'Azúcares (g)', 'Sodio (mg)', 'Densidad (g/ml)', 'Porciones',
    'Código de barras', 'Notas'], propios, [30, 16, 12]);

  return libro;
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Exporta a .xlsx. Sin rango: todo el historial de comidas. */
export async function exportarExcel(opciones: { desde?: string; hasta?: string } = {}): Promise<{
  datos: Uint8Array; blob: Blob; nombreArchivo: string;
}> {
  const [registros, metas, pesos, recetas, alimentosUsuario] = await Promise.all([
    registrosEnRango(opciones.desde ?? '0000-01-01', opciones.hasta ?? '9999-12-31'),
    historialMetas(), listarPesos(), listarRecetas(), listarAlimentosUsuario(),
  ]);
  const libro = await construirLibro({ registros, metas, pesos, recetas, alimentosUsuario });
  const buffer = await libro.xlsx.writeBuffer();
  const datos = new Uint8Array(buffer as ArrayBuffer);
  return { datos, blob: new Blob([datos], { type: TIPO_XLSX }), nombreArchivo: `caloria-${hoy()}.xlsx` };
}
