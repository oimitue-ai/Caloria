import { describe, expect, it } from 'vitest';
import {
  calcularTotales, escalarTotales, formatear, formatearNutriente, kcalDesdeMacros, promediarTotales,
  redondear, soloTotales, sumarTotales, validarEnergia,
} from './calculo';
import { incompleto, platano } from './pruebas/fixtures';

describe('calcularTotales', () => {
  it('150 g × 89 kcal/100 g = 133.5 kcal (sin redondear)', () => {
    const t = calcularTotales(platano.nutrientes, 150);
    expect(t.kcal).toBe(133.5);
    expect(t.proteina).toBeCloseTo(1.635, 9);
    expect(t.fibra).toBeCloseTo(3.9, 9);
    expect(t.faltantes).toEqual([]);
  });

  it('macro faltante cuenta 0 pero se reporta; opcional faltante queda undefined', () => {
    const t = calcularTotales(incompleto.nutrientes, 50);
    expect(t.grasa).toBe(0);
    expect(t.faltantes).toEqual(['grasa']);
    expect(t.fibra).toBeUndefined();
    expect('fibra' in soloTotales(t)).toBe(false);
    expect('faltantes' in soloTotales(t)).toBe(false);
  });

  it('cantidad 0 da 0 y negativa lanza error', () => {
    expect(calcularTotales(platano.nutrientes, 0).kcal).toBe(0);
    expect(() => calcularTotales(platano.nutrientes, -5)).toThrow(RangeError);
  });
});

describe('sumar / escalar / promediar', () => {
  it('suma sin residuos binarios y con opcionales parciales', () => {
    const s = sumarTotales([
      { kcal: 0.1, proteina: 0.2, carbohidratos: 0, grasa: 0, fibra: 1 },
      { kcal: 0.2, proteina: 0.1, carbohidratos: 0, grasa: 0 },
    ]);
    expect(s.kcal).toBe(0.3);
    expect(s.proteina).toBe(0.3);
    expect(s.fibra).toBe(1);
    expect(s.sodio).toBeUndefined();
  });
  it('escalar y promediar', () => {
    expect(escalarTotales({ kcal: 300, proteina: 10, carbohidratos: 0, grasa: 3 }, 0.5).kcal).toBe(150);
    expect(promediarTotales([])).toBeNull();
    expect(promediarTotales([
      { kcal: 100, proteina: 0, carbohidratos: 0, grasa: 0 },
      { kcal: 200, proteina: 0, carbohidratos: 0, grasa: 0 },
    ])?.kcal).toBe(150);
  });
});

describe('kcalDesdeMacros y validarEnergia', () => {
  it('4/4/9', () => {
    expect(kcalDesdeMacros({ proteina: 10, carbohidratos: 20, grasa: 5 })).toBe(165);
    expect(kcalDesdeMacros({})).toBe(0);
  });
  it('detecta incoherencias', () => {
    expect(validarEnergia(platano.nutrientes).coherente).toBe(true);
    expect(validarEnergia({ kcal: 900, proteina: 10, carbohidratos: 20, grasa: 5 }).coherente).toBe(false);
  });
});

describe('formatear (redondeo solo al mostrar)', () => {
  it('redondea y usa formato es-MX', () => {
    expect(formatear(133.5)).toBe('134');
    expect(formatear(1.005, 2)).toBe('1.01');
    expect(formatear(1234.56, 1)).toBe('1,234.6');
    expect(formatear(undefined)).toBe('—');
    expect(formatear(-0.2)).toBe('0');
    expect(redondear(2.675, 2)).toBe(2.68);
    expect(formatearNutriente('kcal', 133.5)).toBe('134 kcal');
    expect(formatearNutriente('proteina', 1.635)).toBe('1.6 g');
    expect(formatearNutriente('fibra', undefined)).toBe('—');
  });
});
