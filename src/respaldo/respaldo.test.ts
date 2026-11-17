import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { Alimento, RegistroComida } from '../tipos';
import { avena, leche, platano } from '../nucleo/pruebas/fixtures';
import { crearIngrediente, recetaComoAlimento } from '../nucleo/recetas';
import {
  agregarFavorito, agregarRegistro, bd, borrarBaseDeDatos, crearAlimentoUsuario, crearReceta, guardarConfig,
  guardarMetas, guardarPerfil, obtenerConfig, obtenerPerfil, registrarPeso, usarBaseDeDatos, listarPesos,
} from '../bd';
import {
  BOM, comidasACSV, crearRespaldo, escaparCSV, exportarComidasCSV, exportarExcel, exportarPesoCSV,
  exportarRespaldoJSON, HOJAS_EXCEL, importarRespaldo, jsonCanonico, leerCSV, leerDatos, leerRespaldo, pesosACSV,
} from './index';

let n = 0;
beforeEach(() => { usarBaseDeDatos(`prueba-respaldo-${++n}`); });
afterEach(async () => { await borrarBaseDeDatos(); });

/** Llena la BD con un poco de todo. */
async function sembrar() {
  await guardarPerfil({ nombre: 'Ñandú "El Rápido"', sexo: 'hombre', edad: 30, estaturaCm: 175, pesoObjetivoKg: 75 });
  await guardarMetas({ kcal: 2000, proteina: 150, carbohidratos: 200, grasa: 67, desde: '2026-11-01' });
  await guardarConfig({ tema: 'oscuro' });
  await registrarPeso({ fecha: '2026-11-01', pesoKg: 82 });
  await registrarPeso({ fecha: '2026-11-16', pesoKg: 80.4, nota: 'en ayunas, "después" de correr' });
  const propio = await crearAlimentoUsuario({
    nombre: 'Tamal de rajas, con queso', marca: 'Doña Pepa', base: 'g',
    nutrientes: { kcal: 210, proteina: 6, carbohidratos: 28, grasa: 8 },
    porciones: [{ etiqueta: '1 pieza (150 g)', unidad: 'pieza', equivalencia: 150, predeterminada: true }],
  });
  const ings = [crearIngrediente(platano, 1, 'pieza'), crearIngrediente(leche, 1, 'taza'), crearIngrediente(avena, 30, 'g')]
    .map((i) => { if (!i.ok) throw new Error(i.motivo); return i.ingrediente; });
  const receta = await crearReceta({ nombre: 'Licuado', porciones: 2, ingredientes: ings });
  await agregarRegistro({ fecha: '2026-11-15', comida: 'desayuno', alimento: platano, cantidad: 150, unidad: 'g' });
  await agregarRegistro({ fecha: '2026-11-16', comida: 'desayuno', alimento: recetaComoAlimento(receta), cantidad: 1, unidad: 'porcion' });
  await agregarRegistro({ fecha: '2026-11-16', comida: 'comida', alimento: propio, cantidad: 2, unidad: 'pieza' });
  await agregarFavorito(avena);
  return { propio, receta };
}

describe('respaldo JSON', () => {
  it('exportar → borrar → importar deja los datos idénticos', async () => {
    await sembrar();
    const antes = await leerDatos();
    const { blob, nombreArchivo, respaldo } = await exportarRespaldoJSON({ marcarFecha: false });
    expect(nombreArchivo).toMatch(/^caloria-respaldo-\d{4}-\d{2}-\d{2}\.json$/);
    expect(respaldo.suma.algoritmo).toBe('SHA-256');
    expect(respaldo.suma.valor).toMatch(/^[0-9a-f]{64}$/);
    expect(respaldo.conteos).toMatchObject({ registros: 3, pesos: 2, recetas: 1, alimentosUsuario: 1, favoritos: 1, metas: 1, perfil: 1 });

    await borrarBaseDeDatos();
    usarBaseDeDatos(`prueba-respaldo-${++n}`);
    expect((await leerDatos()).registros).toEqual([]);

    const lectura = await leerRespaldo(blob);
    if (!lectura.ok) throw new Error(lectura.error);
    const res = await importarRespaldo(lectura.respaldo, 'reemplazar');
    expect(res.agregados.registros).toBe(3);
    const despues = await leerDatos();
    expect(despues).toEqual(antes);
    expect(jsonCanonico(despues)).toBe(jsonCanonico(antes));
    // un nuevo respaldo da la misma suma de verificación
    expect((await crearRespaldo()).suma).toEqual(respaldo.suma);
  });

  it('exportar marca la fecha de último respaldo', async () => {
    expect((await obtenerConfig()).ultimoRespaldo).toBeUndefined();
    const { respaldo } = await exportarRespaldoJSON();
    expect((await obtenerConfig()).ultimoRespaldo).toBe(respaldo.creado);
  });

  it('comprimido (.json.gz) se lee igual', async () => {
    await sembrar();
    const { bytes, nombreArchivo } = await exportarRespaldoJSON({ comprimir: true, marcarFecha: false });
    expect(nombreArchivo.endsWith('.json.gz')).toBe(true);
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
    const r = await leerRespaldo(bytes);
    expect(r.ok).toBe(true);
  });

  it('rechaza archivos dañados, ajenos, de versión futura o con datos inválidos', async () => {
    await sembrar();
    const { respaldo } = await exportarRespaldoJSON({ marcarFecha: false });
    const texto = JSON.stringify(respaldo);

    expect(await leerRespaldo('no es json')).toMatchObject({ ok: false, error: expect.stringMatching(/JSON/) });
    expect(await leerRespaldo('{"a":1}')).toMatchObject({ ok: false, error: expect.stringMatching(/no es un respaldo de CALORÍA/) });

    const futuro = { ...respaldo, version: 99 };
    expect(await leerRespaldo(JSON.stringify(futuro))).toMatchObject({ ok: false, error: expect.stringMatching(/más nueva/) });

    const alterado = JSON.parse(texto);
    alterado.datos.registros[0].totales.kcal = 1;
    expect(await leerRespaldo(JSON.stringify(alterado))).toMatchObject({ ok: false, error: expect.stringMatching(/suma de verificación/) });

    // datos inválidos con suma recalculada: lo detecta zod
    const invalido = JSON.parse(texto);
    invalido.datos.registros[0].fecha = '2026-13-01';
    const { calcularSuma } = await import('./respaldo');
    invalido.suma = await calcularSuma(invalido.datos);
    const r = await leerRespaldo(JSON.stringify(invalido));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/registros\[0\].*fecha/) });
  });

  it('combinar no duplica por id, respeta fecha única de peso y conserva el perfil actual', async () => {
    await sembrar();
    const { respaldo } = await exportarRespaldoJSON({ marcarFecha: false });

    // importar el mismo respaldo sobre sí mismo: nada nuevo
    const mismo = await importarRespaldo(respaldo, 'combinar');
    expect(mismo.agregados.registros).toBe(0);
    expect(mismo.omitidos.registros).toBe(3);
    expect((await leerDatos()).registros).toHaveLength(3);

    // otro dispositivo: perfil distinto, un registro y un peso en fecha ya existente
    await borrarBaseDeDatos();
    usarBaseDeDatos(`prueba-respaldo-${++n}`);
    await guardarPerfil({ nombre: 'Otro', edad: 40 });
    await registrarPeso({ fecha: '2026-11-16', pesoKg: 79 });
    await agregarRegistro({ fecha: '2026-11-17', comida: 'cena', alimento: avena, cantidad: 50, unidad: 'g' });
    const res = await importarRespaldo(respaldo, 'combinar');
    expect(res.agregados.registros).toBe(3);
    expect(res.agregados.pesos).toBe(1);
    expect(res.omitidos.pesos).toBe(1);
    const d = await leerDatos();
    expect(d.registros).toHaveLength(4);
    expect(d.pesos.map((p) => [p.fecha, p.pesoKg]).sort()).toEqual([['2026-11-01', 82], ['2026-11-16', 79]]);
    const perfil = await obtenerPerfil();
    expect(perfil).toMatchObject({ nombre: 'Otro', edad: 40, sexo: 'hombre', estaturaCm: 175, pesoActualKg: 79 });
    expect(await listarPesos()).toHaveLength(2);
  });

  it('reemplazar borra lo que había', async () => {
    await sembrar();
    const { respaldo } = await exportarRespaldoJSON({ marcarFecha: false });
    await agregarRegistro({ fecha: '2026-11-20', comida: 'cena', alimento: avena, cantidad: 50, unidad: 'g' });
    await importarRespaldo(respaldo, 'reemplazar');
    expect((await leerDatos()).registros).toHaveLength(3);
  });
});

describe('CSV', () => {
  it('escapa comas, comillas, saltos de línea y fórmulas', () => {
    expect(escaparCSV('simple')).toBe('simple');
    expect(escaparCSV('con, coma')).toBe('"con, coma"');
    expect(escaparCSV('dice "hola"')).toBe('"dice ""hola"""');
    expect(escaparCSV('dos\nlíneas')).toBe('"dos\nlíneas"');
    expect(escaparCSV(' borde')).toBe('" borde"');
    expect(escaparCSV('=SUMA(A1)')).toBe("'=SUMA(A1)");
    expect(escaparCSV(1.5)).toBe('1.5');
    expect(escaparCSV(undefined)).toBe('');
    expect(escaparCSV(Number.NaN)).toBe('');
  });

  it('comidas: BOM, CRLF, acentos y comillas sobreviven el viaje de ida y vuelta', async () => {
    await sembrar();
    const { texto, blob, nombreArchivo } = await exportarComidasCSV();
    expect(nombreArchivo).toMatch(/\.csv$/);
    expect(texto.startsWith(BOM)).toBe(true);
    expect(texto.includes('\r\n')).toBe(true);
    expect(blob.type).toBe('text/csv;charset=utf-8');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8
    const filas = leerCSV(texto);
    expect(filas[0][0]).toBe('Fecha');
    expect(filas[0][9]).toBe('Calorías (kcal)');
    expect(filas).toHaveLength(4);
    expect(filas[1]).toEqual(expect.arrayContaining(['2026-11-15', 'Desayuno', 'Plátano crudo', '150', 'g', '133.5']));
    const tamal = filas.find((f) => f[2] === 'Tamal de rajas, con queso');
    expect(tamal?.[3]).toBe('Doña Pepa');
    expect(tamal?.[6]).toBe('1 pieza (150 g)');
    expect(tamal?.[9]).toBe('630');
    expect(texto).toContain('"Tamal de rajas, con queso"');
  });

  it('comidasACSV con texto difícil', () => {
    const base = {
      id: 'x', fecha: '2026-11-16', comida: 'cena', alimentoId: 'x', cantidad: 1, unidad: 'g', cantidadBase: 1,
      totales: { kcal: 1, proteina: 0, carbohidratos: 0, grasa: 0 }, creado: 'a', modificado: 'a',
      instantanea: { nombre: 'Pan "dulce", de\nyema', fuente: 'usuario', base: 'g', nutrientes: {}, porciones: [] },
    } as RegistroComida;
    const filas = leerCSV(comidasACSV([base]));
    expect(filas[1][2]).toBe('Pan "dulce", de\nyema');
    expect(filas[1][1]).toBe('Cena');
  });

  it('peso con media móvil y nota con comillas', async () => {
    await sembrar();
    const { texto } = await exportarPesoCSV();
    const filas = leerCSV(texto);
    expect(filas[0]).toEqual(['Fecha', 'Peso (kg)', 'Media móvil 7 días (kg)', 'Tendencia (kg)', 'Nota']);
    expect(filas[2][0]).toBe('2026-11-16');
    expect(filas[2][1]).toBe('80.4');
    expect(filas[2][4]).toBe('en ayunas, "después" de correr');
    expect(pesosACSV([])).toBe(`${BOM}Fecha,Peso (kg),Media móvil 7 días (kg),Tendencia (kg),Nota\r\n`);
  });
});

describe('Excel', () => {
  it('genera .xlsx con las 5 hojas y datos correctos', async () => {
    await sembrar();
    const { datos, blob, nombreArchivo } = await exportarExcel();
    expect(nombreArchivo).toMatch(/\.xlsx$/);
    expect(blob.size).toBe(datos.byteLength);
    expect([datos[0], datos[1]]).toEqual([0x50, 0x4b]); // ZIP "PK"

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(datos.buffer as ArrayBuffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual([...HOJAS_EXCEL]);

    const comidas = libro.getWorksheet('Comidas')!;
    expect(comidas.rowCount).toBe(4);
    expect(comidas.getRow(2).getCell(3).value).toBe('Plátano crudo');
    expect(comidas.getRow(2).getCell(10).value).toBe(133.5);
    const f = comidas.getRow(2).getCell(1).value as Date;
    expect(f.toISOString().slice(0, 10)).toBe('2026-11-15');

    const resumen = libro.getWorksheet('Resumen diario')!;
    expect(resumen.rowCount).toBe(3); // 2 días con registros
    expect(resumen.getRow(3).getCell(9).value).toBe(2000);

    const peso = libro.getWorksheet('Peso')!;
    expect(peso.getRow(3).getCell(2).value).toBe(80.4);

    const recetas = libro.getWorksheet('Recetas')!;
    const porPorcion = recetas.getRow(recetas.rowCount);
    expect(porPorcion.getCell(4).value).toBe('POR PORCIÓN');
    expect(porPorcion.getCell(10).value).toBe(186.46);

    const propios = libro.getWorksheet('Alimentos propios')!;
    expect(propios.getRow(2).getCell(1).value).toBe('Tamal de rajas, con queso');
    expect(propios.getRow(2).getCell(13).value).toBe('1 pieza (150 g) = 150 g');
  });

  it('funciona con la BD vacía', async () => {
    const { datos } = await exportarExcel();
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(datos.buffer as ArrayBuffer);
    expect(libro.worksheets).toHaveLength(5);
  });
});

// Evita que TypeScript marque como no usados tipos auxiliares de las pruebas
export type { Alimento };
void bd;
