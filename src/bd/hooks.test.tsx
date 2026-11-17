// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { platano, avena } from '../nucleo/pruebas/fixtures';
import {
  agregarRegistro, borrarBaseDeDatos, crearReceta, eliminarRegistro, guardarConfig, guardarMetas, guardarPerfil,
  registrarPeso, useAlimentosUsuario, useConfig, useDia, useDiasConRegistro, useEstadisticas, useFavoritos,
  useFrecuentes, useMetas, useMetaVigente, usePerfil, usePesos, useRango, useRecetas, useRecientes, useResumenPeso,
  usarBaseDeDatos, agregarFavorito, crearAlimentoUsuario,
} from './index';
import { crearIngrediente } from '../nucleo/recetas';

let n = 0;
beforeEach(() => { usarBaseDeDatos(`prueba-hooks-${++n}`); });
afterEach(async () => { await borrarBaseDeDatos(); });

const F = '2026-11-16';

describe('hooks en vivo', () => {
  it('useDia se actualiza al agregar y eliminar', async () => {
    await guardarMetas({ kcal: 2000, proteina: 100, carbohidratos: 250, grasa: 60, desde: '2026-11-01' });
    const { result } = renderHook(() => useDia(F));
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.registrado).toBe(false);
    let id = '';
    await act(async () => {
      id = (await agregarRegistro({ fecha: F, comida: 'desayuno', alimento: platano, cantidad: 150, unidad: 'g' })).id;
    });
    await waitFor(() => expect(result.current?.totales.kcal).toBe(133.5));
    expect(result.current?.porComida.desayuno.registros).toHaveLength(1);
    expect(result.current?.restante?.kcal).toBe(1866.5);
    await act(async () => { await eliminarRegistro(id); });
    await waitFor(() => expect(result.current?.registrado).toBe(false));
  });

  it('resto de hooks devuelven datos', async () => {
    await agregarRegistro({ fecha: F, comida: 'cena', alimento: avena, cantidad: 40, unidad: 'g' });
    await registrarPeso({ fecha: '2026-11-01', pesoKg: 82 });
    await registrarPeso({ fecha: F, pesoKg: 80 });
    await guardarPerfil({ sexo: 'mujer', pesoObjetivoKg: 75 });
    await guardarMetas({ kcal: 1800, proteina: 100, carbohidratos: 200, grasa: 60, desde: F });
    await guardarConfig({ tema: 'claro' });
    await agregarFavorito(platano);
    await crearAlimentoUsuario({ nombre: 'Pan', base: 'g', nutrientes: { kcal: 265 } });
    const ing = crearIngrediente(avena, 50, 'g');
    if (!ing.ok) throw new Error();
    await crearReceta({ nombre: 'Avena cocida', porciones: 1, ingredientes: [ing.ingrediente] });

    const { result } = renderHook(() => ({
      rango: useRango('2026-11-01', '2026-11-30'),
      est: useEstadisticas('2026-11-10', F),
      pesos: usePesos(),
      resumenPeso: useResumenPeso(),
      metas: useMetas(),
      vigente: useMetaVigente('2026-11-15'),
      perfil: usePerfil(),
      recientes: useRecientes('cena'),
      frecuentes: useFrecuentes(),
      favoritos: useFavoritos(),
      recetas: useRecetas(),
      propios: useAlimentosUsuario(),
      config: useConfig(),
      dias: useDiasConRegistro('2026-11'),
    }));
    await waitFor(() => expect(Object.values(result.current).every((v) => v !== undefined)).toBe(true));
    const r = result.current;
    expect(r.rango).toHaveLength(1);
    expect(r.est?.diasRegistrados).toBe(1);
    expect(r.pesos?.map((p) => p.pesoKg)).toEqual([82, 80]);
    expect(r.resumenPeso?.distanciaObjetivoKg).toBe(-5);
    expect(r.metas).toHaveLength(1);
    expect(r.vigente).toBeNull();
    expect(r.perfil).toMatchObject({ sexo: 'mujer', pesoActualKg: 80, pesoInicialKg: 82 });
    expect(r.recientes?.[0].alimentoId).toBe(avena.id);
    expect(r.frecuentes).toHaveLength(1);
    expect(r.favoritos?.[0].alimentoId).toBe(platano.id);
    expect(r.recetas?.[0].nombre).toBe('Avena cocida');
    expect(r.propios?.[0].nombre).toBe('Pan');
    expect(r.config?.tema).toBe('claro');
    expect([...r.dias!]).toEqual([F]);
  });
});
