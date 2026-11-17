import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Alimento } from '../tipos';
import { crearIngrediente, recetaComoAlimento } from '../nucleo/recetas';
import { avena, leche, platano } from '../nucleo/pruebas/fixtures';
import {
  agregarFavorito, agregarRegistro, alternarFavorito, BaseCaloria, borrarBaseDeDatos, buscarAlimentosLocales,
  buscarCodigoBarrasLocal, cerrarBD, copiarComida, copiarDia, crearAlimentoUsuario, crearReceta, diasConRegistro,
  editarAlimentoUsuario, editarPeso, editarReceta, editarRegistro, eliminarAlimentoUsuario, eliminarPeso,
  eliminarReceta, eliminarRegistro, ErrorDatos, estadisticasDeRango, guardarConfig, guardarMetas, guardarPerfil,
  historialMetas, listarFavoritos, listarFrecuentes, listarPesos, listarRecientes, metasVigentes, obtenerAlimentoLocal,
  obtenerConfig, obtenerPerfil, obtenerRegistro, podarCache, registrarPeso, registrosDelDia, registrosEnRango,
  repetirUso, respaldoPendiente, restaurarRegistro, resumenDelDia, usarBaseDeDatos, vaciarComida, VERSION_ESQUEMA, bd,
} from './index';
import { VERSIONES } from './esquema';

let n = 0;
beforeEach(() => { usarBaseDeDatos(`prueba-bd-${++n}`); });
afterEach(async () => { await borrarBaseDeDatos(); });

const F = '2026-11-16';

describe('registros', () => {
  it('agregar calcula cantidadBase y totales y guarda instantánea', async () => {
    const r = await agregarRegistro({ fecha: F, comida: 'desayuno', alimento: platano, cantidad: 150, unidad: 'g' });
    expect(r.cantidadBase).toBe(150);
    expect(r.totales.kcal).toBe(133.5);
    expect(r.instantanea.nombre).toBe('Plátano crudo');
    expect('faltantes' in r.totales).toBe(false);
    expect(await obtenerRegistro(r.id)).toEqual(r);
    const p = await agregarRegistro({ fecha: F, comida: 'desayuno', alimento: platano, cantidad: 2, unidad: 'pieza', porcionEtiqueta: '1 pieza mediana (118 g)' });
    expect(p.cantidadBase).toBe(236);
  });

  it('rechaza conversiones imposibles y fechas inválidas con ErrorDatos', async () => {
    await expect(agregarRegistro({ fecha: F, comida: 'cena', alimento: avena, cantidad: 100, unidad: 'ml' }))
      .rejects.toBeInstanceOf(ErrorDatos);
    await expect(agregarRegistro({ fecha: '2026-02-30', comida: 'cena', alimento: avena, cantidad: 1, unidad: 'g' }))
      .rejects.toThrow(/Fecha inválida/);
    expect(await registrosDelDia(F)).toEqual([]);
  });

  it('editar recalcula, cambiar unidad quita la porción, eliminar y restaurar', async () => {
    const r = await agregarRegistro({ fecha: F, comida: 'desayuno', alimento: platano, cantidad: 1, unidad: 'pieza', porcionEtiqueta: '1 pieza grande (136 g)' });
    expect(r.cantidadBase).toBe(136);
    const e = await editarRegistro(r.id, { cantidad: 2 });
    expect(e.cantidadBase).toBe(272);
    expect(e.porcionEtiqueta).toBe('1 pieza grande (136 g)');
    const g = await editarRegistro(r.id, { cantidad: 100, unidad: 'g' });
    expect(g.porcionEtiqueta).toBeUndefined();
    expect(g.totales.kcal).toBe(89);
    expect(g.creado).toBe(r.creado);
    const m = await editarRegistro(r.id, { comida: 'cena', fecha: '2026-11-17' });
    expect([m.fecha, m.comida]).toEqual(['2026-11-17', 'cena']);
    await expect(editarRegistro(r.id, { unidad: 'ml' })).rejects.toBeInstanceOf(ErrorDatos);
    expect((await obtenerRegistro(r.id))?.unidad).toBe('g'); // nada cambió
    const borrado = await eliminarRegistro(r.id);
    expect(await obtenerRegistro(r.id)).toBeUndefined();
    await restaurarRegistro(borrado!);
    expect(await obtenerRegistro(r.id)).toEqual(m);
    await expect(editarRegistro('no-existe', { cantidad: 1 })).rejects.toThrow(/ya no existe/);
  });

  it('copiar comida y día; vaciar comida', async () => {
    await agregarRegistro({ fecha: F, comida: 'desayuno', alimento: platano, cantidad: 1, unidad: 'pieza' });
    await agregarRegistro({ fecha: F, comida: 'desayuno', alimento: leche, cantidad: 1, unidad: 'taza' });
    await agregarRegistro({ fecha: F, comida: 'cena', alimento: avena, cantidad: 30, unidad: 'g' });
    const c = await copiarComida(F, 'desayuno', '2026-11-17', 'colacion1');
    expect(c).toHaveLength(2);
    expect(c.every((x) => x.fecha === '2026-11-17' && x.comida === 'colacion1')).toBe(true);
    const d = await copiarDia(F, '2026-11-18');
    expect(d.map((x) => x.comida).sort()).toEqual(['cena', 'desayuno', 'desayuno']);
    const orig = await registrosDelDia(F);
    expect(new Set([...orig, ...d].map((x) => x.id)).size).toBe(6);
    expect((await resumenDelDia('2026-11-18')).totales).toEqual((await resumenDelDia(F)).totales);
    expect(await vaciarComida(F, 'desayuno')).toHaveLength(2);
    expect(await registrosDelDia(F)).toHaveLength(1);
    expect(await diasConRegistro('2026-11')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    expect(await registrosEnRango('2026-11-17', '2026-11-18')).toHaveLength(5);
  });

  it('resumen del día con meta vigente y estadísticas de rango', async () => {
    await guardarMetas({ kcal: 2000, proteina: 150, carbohidratos: 200, grasa: 67, desde: '2026-11-01' });
    await agregarRegistro({ fecha: F, comida: 'comida', alimento: platano, cantidad: 1000, unidad: 'g' });
    const r = await resumenDelDia(F);
    expect(r.totales.kcal).toBe(890);
    expect(r.restante?.kcal).toBe(1110);
    expect(r.porComida.comida.registros).toHaveLength(1);
    const e = await estadisticasDeRango('2026-11-10', F);
    expect(e.diasPeriodo).toBe(7);
    expect(e.diasRegistrados).toBe(1);
    expect(e.cumplimiento).toBe(0);
  });
});

describe('inmutabilidad del historial', () => {
  it('editar o borrar un alimento propio NO altera registros ni recetas', async () => {
    const tortilla = await crearAlimentoUsuario({
      nombre: 'Tortilla de la esquina', base: 'g', nutrientes: { kcal: 218, proteina: 5.7, carbohidratos: 44.6, grasa: 2.9 },
      porciones: [{ etiqueta: '1 pieza (30 g)', unidad: 'pieza', equivalencia: 30, predeterminada: true }],
      codigoBarras: '7501000000001',
    });
    expect(tortilla.id).toMatch(/^usuario:/);
    const r = await agregarRegistro({ fecha: F, comida: 'comida', alimento: tortilla, cantidad: 3, unidad: 'pieza' });
    expect(r.totales.kcal).toBeCloseTo(196.2, 9);
    const ing = crearIngrediente(tortilla, 2, 'pieza');
    if (!ing.ok) throw new Error();
    const receta = await crearReceta({ nombre: 'Tacos', porciones: 1, ingredientes: [ing.ingrediente] });

    const editado = await editarAlimentoUsuario(tortilla.id, {
      nutrientes: { kcal: 300, proteina: 6, carbohidratos: 60, grasa: 3 },
      porciones: [{ etiqueta: '1 pieza (50 g)', unidad: 'pieza', equivalencia: 50 }],
    });
    expect(editado.nutrientes.kcal).toBe(300);
    expect((await obtenerAlimentoLocal(tortilla.id))?.nutrientes.kcal).toBe(300);

    const guardado = await obtenerRegistro(r.id);
    expect(guardado).toEqual(r); // idéntico
    // al editar la cantidad se usa la instantánea (218 kcal, 30 g/pieza), no el alimento nuevo
    const e = await editarRegistro(r.id, { cantidad: 4 });
    expect(e.cantidadBase).toBe(120);
    expect(e.totales.kcal).toBeCloseTo(261.6, 9);
    expect(e.instantanea.nutrientes.kcal).toBe(218);
    // la receta tampoco cambió
    const rec = await obtenerAlimentoLocal(`receta:${receta.id}`);
    expect(rec?.nutrientes.kcal).toBeCloseTo(218, 9);

    await eliminarAlimentoUsuario(tortilla.id);
    expect(await obtenerAlimentoLocal(tortilla.id)).toBeUndefined();
    expect((await obtenerRegistro(r.id))?.instantanea.nombre).toBe('Tortilla de la esquina');
    expect(await listarRecientes()).toEqual([]);
  });

  it('editar una receta no altera los registros hechos con ella', async () => {
    const ings = [crearIngrediente(platano, 1, 'pieza'), crearIngrediente(leche, 1, 'taza'), crearIngrediente(avena, 30, 'g')]
      .map((i) => { if (!i.ok) throw new Error(i.motivo); return i.ingrediente; });
    const receta = await crearReceta({ nombre: 'Licuado', porciones: 2, ingredientes: ings });
    const alimento = recetaComoAlimento(receta);
    const r = await agregarRegistro({ fecha: F, comida: 'desayuno', alimento, cantidad: 1, unidad: 'porcion' });
    expect(r.totales.kcal).toBeCloseTo(186.46, 6);
    await editarReceta(receta.id, { porciones: 4 });
    expect((await obtenerRegistro(r.id))?.totales.kcal).toBeCloseTo(186.46, 6);
    expect((await obtenerAlimentoLocal(alimento.id))?.porciones[0].equivalencia).toBeCloseTo(98.8, 9);
    await eliminarReceta(receta.id);
    expect(await obtenerAlimentoLocal(alimento.id)).toBeUndefined();
    expect(await obtenerRegistro(r.id)).toEqual(r);
  });

  it('receta inválida se rechaza', async () => {
    await expect(crearReceta({ nombre: 'Vacía', porciones: 2, ingredientes: [] })).rejects.toBeInstanceOf(ErrorDatos);
    await expect(crearReceta({ nombre: '  ', porciones: 2, ingredientes: [] })).rejects.toBeInstanceOf(ErrorDatos);
  });
});

describe('recientes, frecuentes, favoritos y caché', () => {
  it('recuerda la última cantidad por comida y permite repetir en un toque', async () => {
    await agregarRegistro({ fecha: '2026-11-14', comida: 'desayuno', alimento: platano, cantidad: 1, unidad: 'pieza' });
    await agregarRegistro({ fecha: '2026-11-15', comida: 'desayuno', alimento: avena, cantidad: 40, unidad: 'g' });
    const ultimo = await agregarRegistro({ fecha: F, comida: 'desayuno', alimento: platano, cantidad: 2, unidad: 'pieza', porcionEtiqueta: '1 pieza grande (136 g)' });
    await agregarRegistro({ fecha: F, comida: 'cena', alimento: avena, cantidad: 30, unidad: 'g' });

    const rec = await listarRecientes('desayuno');
    expect(rec.map((u) => u.alimentoId)).toEqual([platano.id, avena.id]);
    expect(rec[0]).toMatchObject({ cantidad: 2, unidad: 'pieza', porcionEtiqueta: '1 pieza grande (136 g)', usos: 2 });
    expect((await listarRecientes()).map((u) => u.alimentoId)).toEqual([avena.id, platano.id]);
    const frec = await listarFrecuentes();
    // empate en usos: primero el usado más recientemente
    expect(frec.map((u) => [u.alimentoId, u.usos])).toEqual([[avena.id, 2], [platano.id, 2]]);
    expect((await listarFrecuentes('cena')).map((u) => u.alimentoId)).toEqual([avena.id]);

    // editar la cantidad actualiza "última cantidad" sin sumar uso
    await editarRegistro(ultimo.id, { cantidad: 3 });
    expect((await listarRecientes('desayuno'))[0]).toMatchObject({ cantidad: 3, usos: 2 });

    const repetido = await repetirUso(rec[0], '2026-11-17', 'desayuno');
    expect(repetido.cantidadBase).toBe(272);
    expect(repetido.alimentoId).toBe(platano.id);
  });

  it('la caché guarda alimentos de catálogo (no propios) y sirve sin conexión', async () => {
    const conCodigo: Alimento = { ...avena, id: 'usda_branded:1', fuente: 'usda_branded', codigoBarras: '0001' };
    await agregarRegistro({ fecha: F, comida: 'desayuno', alimento: conCodigo, cantidad: 30, unidad: 'g' });
    expect(await obtenerAlimentoLocal(conCodigo.id)).toEqual(conCodigo);
    expect((await buscarCodigoBarrasLocal('0001'))?.id).toBe(conCodigo.id);
    const propio = await crearAlimentoUsuario({ nombre: 'Atole de avena casero', base: 'ml', nutrientes: { kcal: 80 } });
    await agregarRegistro({ fecha: F, comida: 'cena', alimento: propio, cantidad: 1, unidad: 'taza' });
    expect(await bd().cacheAlimentos.count()).toBe(1);
    const encontrados = await buscarAlimentosLocales('AVENA');
    // primero los que empiezan con el texto
    expect(encontrados.map((a) => a.id)).toEqual([conCodigo.id, propio.id]);
    expect(await buscarAlimentosLocales('atole avena')).toHaveLength(1);
    expect(await podarCache(0)).toBe(1);
  });

  it('favoritos', async () => {
    expect(await alternarFavorito(platano)).toBe(true);
    await agregarFavorito(avena);
    expect((await listarFavoritos()).map((f) => f.nombre)).toEqual(['Avena en hojuelas', 'Plátano crudo']);
    expect(await alternarFavorito(platano)).toBe(false);
    expect(await listarFavoritos()).toHaveLength(1);
    expect(await podarCache(0)).toBe(1); // borra el plátano (ya no es favorito), no la avena
    expect(await obtenerAlimentoLocal(avena.id)).toEqual(avena);
  });
});

describe('peso, perfil, metas y configuración', () => {
  it('peso: una medición por fecha y perfil sincronizado', async () => {
    await registrarPeso({ fecha: '2026-11-01', pesoKg: 82 });
    await registrarPeso({ fecha: '2026-11-08', pesoKg: 81 });
    const p = await registrarPeso({ fecha: '2026-11-08', pesoKg: 80.6, nota: 'después de correr' });
    expect(await listarPesos()).toHaveLength(2);
    expect(p.nota).toBe('después de correr');
    expect(await obtenerPerfil()).toEqual({ pesoActualKg: 80.6, pesoInicialKg: 82 });
    await expect(editarPeso(p.id, { fecha: '2026-11-01' })).rejects.toThrow(/Ya hay un peso/);
    await expect(registrarPeso({ fecha: F, pesoKg: 5 })).rejects.toBeInstanceOf(ErrorDatos);
    await eliminarPeso(p.id);
    expect((await obtenerPerfil()).pesoActualKg).toBe(82);
    expect(await listarPesos('2026-11-02', '2026-11-30')).toEqual([]);
  });

  it('la BD rechaza dos pesos con la misma fecha (índice único)', async () => {
    await bd().pesos.add({ id: 'a', fecha: F, pesoKg: 80 });
    await expect(bd().pesos.add({ id: 'b', fecha: F, pesoKg: 81 })).rejects.toThrow();
  });

  it('perfil: mezcla, undefined borra, validación', async () => {
    await guardarPerfil({ sexo: 'hombre', edad: 30, estaturaCm: 175 });
    await guardarPerfil({ edad: 31, nombre: 'Prueba' });
    expect(await obtenerPerfil()).toEqual({ sexo: 'hombre', edad: 31, estaturaCm: 175, nombre: 'Prueba' });
    await guardarPerfil({ nombre: undefined });
    expect((await obtenerPerfil()).nombre).toBeUndefined();
    await expect(guardarPerfil({ estaturaCm: 20 })).rejects.toThrow(/Estatura/);
  });

  it('metas: historial por `desde` y vigente por fecha', async () => {
    await guardarMetas({ kcal: 2000, proteina: 150, carbohidratos: 200, grasa: 67, desde: '2026-11-01' });
    await guardarMetas({ kcal: 1800, proteina: 150, carbohidratos: 160, grasa: 60, desde: '2026-11-10' });
    await guardarMetas({ kcal: 1850, proteina: 150, carbohidratos: 170, grasa: 60, desde: '2026-11-10', personalizada: true });
    expect((await historialMetas()).map((m) => m.kcal)).toEqual([2000, 1850]);
    expect(await metasVigentes('2026-10-31')).toBeNull();
    expect((await metasVigentes('2026-11-09'))?.kcal).toBe(2000);
    expect((await metasVigentes('2026-11-30'))?.kcal).toBe(1850);
    await expect(guardarMetas({ kcal: 0, proteina: 0, carbohidratos: 0, grasa: 0 })).rejects.toBeInstanceOf(ErrorDatos);
  });

  it('configuración y recordatorio de respaldo', async () => {
    expect(await obtenerConfig()).toEqual({ tema: 'sistema', recordarRespaldoDias: 7 });
    await guardarConfig({ tema: 'oscuro' });
    expect((await obtenerConfig()).tema).toBe('oscuro');
    expect(respaldoPendiente({ tema: 'claro' })).toBe(true);
    const ahora = new Date(2026, 10, 16, 12);
    expect(respaldoPendiente({ tema: 'claro', ultimoRespaldo: new Date(2026, 10, 12).toISOString() }, ahora)).toBe(false);
    expect(respaldoPendiente({ tema: 'claro', ultimoRespaldo: new Date(2026, 10, 9).toISOString() }, ahora)).toBe(true);
    expect(respaldoPendiente({ tema: 'claro', recordarRespaldoDias: 0 }, ahora)).toBe(false);
  });
});

describe('persistencia', () => {
  it('los datos sobreviven a cerrar y reabrir la base de datos', async () => {
    const r = await agregarRegistro({ fecha: F, comida: 'desayuno', alimento: platano, cantidad: 150, unidad: 'g' });
    await registrarPeso({ fecha: F, pesoKg: 80 });
    await guardarMetas({ kcal: 2000, proteina: 150, carbohidratos: 200, grasa: 67, desde: F });
    const nombre = bd().name;
    cerrarBD();
    const otra = new BaseCaloria(nombre);
    await otra.open();
    expect(otra.verno).toBe(VERSION_ESQUEMA);
    expect(await otra.registros.get(r.id)).toEqual(r);
    expect(await otra.pesos.count()).toBe(1);
    expect((await otra.metas.get(F))?.kcal).toBe(2000);
    otra.close();
    // y la instancia compartida se vuelve a abrir sola
    expect(await obtenerRegistro(r.id)).toEqual(r);
  });
});

describe('migraciones versionadas', () => {
  it('una versión nueva en VERSIONES migra los datos existentes al abrir', async () => {
    const r = await agregarRegistro({ fecha: F, comida: 'cena', alimento: platano, cantidad: 100, unidad: 'g' });
    const nombre = bd().name;
    cerrarBD();
    VERSIONES.push({
      version: VERSION_ESQUEMA + 1,
      stores: { registros: 'id, fecha, [fecha+comida], alimentoId, comida' },
      migrar: async (tx) => {
        await tx.table('registros').toCollection().modify((x: { notaMigracion?: string }) => { x.notaMigracion = 'v2'; });
      },
    });
    try {
      const v2 = new BaseCaloria(nombre);
      await v2.open();
      expect(v2.verno).toBe(VERSION_ESQUEMA + 1);
      const migrado = (await v2.registros.get(r.id)) as RegistroMigrado;
      expect(migrado.notaMigracion).toBe('v2');
      expect(await v2.registros.where('comida').equals('cena').count()).toBe(1);
      v2.close();
    } finally {
      VERSIONES.pop();
    }
  });
});

type RegistroMigrado = Awaited<ReturnType<typeof obtenerRegistro>> & { notaMigracion?: string };
