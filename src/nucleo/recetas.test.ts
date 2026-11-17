import { describe, expect, it } from 'vitest';
import type { Receta } from '../tipos';
import { convertirABase, unidadesDisponibles } from './unidades';
import { crearIngrediente, pesoReceta, recetaComoAlimento, totalesPorPorcion, totalesReceta } from './recetas';
import { calcularTotales } from './calculo';
import { avena, incompleto, leche, lecheSinDensidad, platano } from './pruebas/fixtures';

function licuado(conDensidad = true): Receta {
  const ing = [
    crearIngrediente(platano, 1, 'pieza'),
    crearIngrediente(conDensidad ? leche : lecheSinDensidad, 1, 'taza'),
    crearIngrediente(avena, 30, 'g'),
  ];
  return {
    id: 'r1', nombre: 'Licuado de plátano', porciones: 2,
    ingredientes: ing.map((r) => { if (!r.ok) throw new Error(r.motivo); return r.ingrediente; }),
    creado: '2026-11-16T12:00:00.000Z', modificado: '2026-11-16T12:00:00.000Z',
  };
}

describe('recetas: licuado (plátano 118 g + leche 240 ml + avena 30 g), 2 porciones', () => {
  it('cantidades base de los ingredientes', () => {
    expect(licuado().ingredientes.map((i) => i.cantidadBase)).toEqual([118, 240, 30]);
  });

  it('totales de la receta y por porción', () => {
    const t = totalesReceta(licuado());
    // 118×0.89 + 240×0.63 + 30×3.89 = 105.02 + 151.2 + 116.7
    expect(t.kcal).toBeCloseTo(372.92, 9);
    expect(t.incompletos).toEqual([]);
    const p = totalesPorPorcion(licuado());
    expect(p.kcal).toBeCloseTo(186.46, 9);
    expect(p.proteina).toBeCloseTo((118 * 0.0109 + 240 * 0.032 + 30 * 0.1689) / 2, 9);
  });

  it('con densidad de la leche el peso es real (g) y se registra por gramos', () => {
    const r = licuado();
    expect(pesoReceta(r)).toEqual({ pesoG: 395.2, origen: 'suma_gramos', registrablePorGramos: true });
    const a = recetaComoAlimento(r);
    expect(a.id).toBe('receta:r1');
    expect(a.fuente).toBe('receta');
    expect(a.soloPorciones).toBeUndefined();
    expect(a.porciones).toEqual([{ etiqueta: '1 porción', unidad: 'porcion', equivalencia: 197.6, predeterminada: true }]);
    // 1 porción del alimento = mismos totales que totalesPorPorcion
    const c = convertirABase(a, 1, 'porcion');
    expect(c.ok && calcularTotales(a.nutrientes, c.cantidadBase).kcal).toBeCloseTo(186.46, 6);
    // y la receta completa por gramos
    expect(calcularTotales(a.nutrientes, 395.2).kcal).toBeCloseTo(372.92, 6);
    expect(unidadesDisponibles(a).map((o) => o.unidad)).toEqual(['porcion', 'g', 'kg']);
  });

  it('sin densidad ni peso final: peso nominal y soloPorciones', () => {
    const r = licuado(false);
    expect(pesoReceta(r).origen).toBe('nominal');
    const a = recetaComoAlimento(r);
    expect(a.soloPorciones).toBe(true);
    expect(a.notas).toMatch(/solo se registra por porciones/);
    expect(convertirABase(a, 100, 'g').ok).toBe(false);
    const c = convertirABase(a, 1, 'porcion');
    expect(c.ok && calcularTotales(a.nutrientes, c.cantidadBase).kcal).toBeCloseTo(186.46, 6);
  });

  it('pesoFinalG manda sobre la suma', () => {
    const r = { ...licuado(false), pesoFinalG: 400 };
    expect(pesoReceta(r)).toEqual({ pesoG: 400, origen: 'peso_final', registrablePorGramos: true });
    const a = recetaComoAlimento(r);
    expect(a.porciones[0].equivalencia).toBe(200);
    expect(a.nutrientes.kcal).toBeCloseTo(372.92 / 4, 6);
  });

  it('ingrediente con datos faltantes se reporta y la receta lo anota', () => {
    const r = licuado();
    const ing = crearIngrediente(incompleto, 20, 'g');
    if (!ing.ok) throw new Error();
    r.ingredientes.push(ing.ingrediente);
    expect(totalesReceta(r).incompletos).toEqual([{ nombre: 'Galleta X', faltantes: ['grasa'] }]);
    expect(recetaComoAlimento(r).notas).toMatch(/Datos incompletos en: Galleta X/);
  });

  it('crearIngrediente no convertible devuelve motivo', () => {
    expect(crearIngrediente(avena, 100, 'ml').ok).toBe(false);
  });

  it('receta sin porciones lanza error', () => {
    expect(() => recetaComoAlimento({ ...licuado(), porciones: 0 })).toThrow();
  });
});
