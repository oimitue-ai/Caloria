import { describe, expect, it } from 'vitest';
import {
  imc, normalizarPesos, promediosMensuales, promediosSemanales, regresionLineal, resumenPeso, ritmoKgSemana,
  serieTendencia,
} from './peso';
import { sumarDias } from './fechas';

/** Baja exactamente 0.1 kg/día desde 90 kg a partir del lunes 2 nov 2026. */
const lineal = Array.from({ length: 29 }, (_, i) => ({ fecha: sumarDias('2026-11-02', i), pesoKg: 90 - 0.1 * i }));

describe('peso', () => {
  it('normaliza: ordena, promedia duplicados y descarta inválidos', () => {
    expect(normalizarPesos([
      { fecha: '2026-11-03', pesoKg: 80 }, { fecha: '2026-11-01', pesoKg: 81 },
      { fecha: '2026-11-03', pesoKg: 79 }, { fecha: '2026-11-04', pesoKg: Number.NaN },
    ])).toEqual([{ fecha: '2026-11-01', pesoKg: 81 }, { fecha: '2026-11-03', pesoKg: 79.5 }]);
  });

  it('promedios semanales (lunes–domingo) y mensuales', () => {
    const pesos = [
      { fecha: '2026-11-15', pesoKg: 80 }, // domingo
      { fecha: '2026-11-16', pesoKg: 79 }, // lunes
      { fecha: '2026-11-18', pesoKg: 78 },
      { fecha: '2026-12-01', pesoKg: 77 },
    ];
    expect(promediosSemanales(pesos)).toEqual([
      { inicio: '2026-11-09', fin: '2026-11-15', promedioKg: 80, minimoKg: 80, maximoKg: 80, registros: 1 },
      { inicio: '2026-11-16', fin: '2026-11-22', promedioKg: 78.5, minimoKg: 78, maximoKg: 79, registros: 2 },
      { inicio: '2026-11-30', fin: '2026-12-06', promedioKg: 77, minimoKg: 77, maximoKg: 77, registros: 1 },
    ]);
    const m = promediosMensuales(pesos);
    expect(m.map((x) => [x.mes, x.promedioKg, x.fin])).toEqual([['2026-11', 79, '2026-11-30'], ['2026-12', 77, '2026-12-31']]);
  });

  it('media móvil de 7 días por fecha (no por número de registros)', () => {
    const s = serieTendencia([
      { fecha: '2026-11-01', pesoKg: 80 }, { fecha: '2026-11-07', pesoKg: 82 }, { fecha: '2026-11-08', pesoKg: 84 },
    ]);
    expect(s.map((p) => p.mediaMovilKg)).toEqual([80, 81, 83]); // el 1 sale de la ventana el día 8
    expect(s[0].tendenciaKg).toBe(80);
    expect(s[1].tendenciaKg).toBeCloseTo(80 + (1 - 0.9 ** 6) * 2, 6);
  });

  it('ritmo por regresión sobre la tendencia: datos lineales dan la pendiente aproximada', () => {
    const r = ritmoKgSemana(lineal, { alfa: 1 }); // alfa 1 = tendencia idéntica a los datos
    expect(r).toBeCloseTo(-0.7, 6);
    const suave = ritmoKgSemana(lineal)!;
    expect(suave).toBeLessThan(0);
    expect(suave).toBeGreaterThan(-0.7);
    expect(ritmoKgSemana([{ fecha: '2026-11-01', pesoKg: 80 }])).toBeNull();
    expect(ritmoKgSemana([{ fecha: '2026-11-01', pesoKg: 80 }, { fecha: '2026-11-03', pesoKg: 79 }])).toBeNull();
    expect(regresionLineal([{ fecha: '2026-11-01', valor: 1 }, { fecha: '2026-11-01', valor: 2 }])).toBeNull();
  });

  it('resumen: variación, distancia al objetivo, progreso y estimación', () => {
    const r = resumenPeso(lineal, { pesoObjetivoKg: 85 }, { alfa: 1 });
    expect(r.actual).toEqual({ fecha: '2026-11-30', pesoKg: 87.2 });
    expect(r.inicialKg).toBe(90);
    expect(r.variacionKg).toBe(-2.8);
    expect(r.distanciaObjetivoKg).toBe(-2.2);
    expect(r.objetivoAlcanzado).toBe(false);
    expect(r.progreso).toBe(0.56);
    expect(r.semanasEstimadas).toBeCloseTo(2.2 / 0.7, 6);
    expect(r.fechaEstimada).toBe('2026-12-22'); // 2.2 kg ÷ 0.1 kg/día = 22 días
    const alcanzado = resumenPeso(lineal, { pesoObjetivoKg: 88, pesoInicialKg: 90 });
    expect(alcanzado.objetivoAlcanzado).toBe(true);
    expect(alcanzado.semanasEstimadas).toBeNull();
    const vacio = resumenPeso([]);
    expect(vacio.actual).toBeNull();
    expect(vacio.variacionKg).toBeNull();
  });

  it('IMC', () => {
    expect(imc(80, 175)).toBeCloseTo(26.122449, 5);
    expect(imc(0, 175)).toBeNull();
  });
});
