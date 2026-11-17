import { describe, expect, it } from 'vitest';
import type { Metas, RegistroComida } from '../tipos';
import { estadisticasRango, evaluarDia, resumirDia, serieDiaria } from './estadisticas';

const t = (kcal: number) => ({ kcal, proteina: kcal / 20, carbohidratos: kcal / 8, grasa: kcal / 40 });
const reg = (fecha: string, comida: RegistroComida['comida'], kcal: number) => ({ fecha, comida, totales: t(kcal) });
const metas: Metas[] = [
  { kcal: 2000, proteina: 100, carbohidratos: 250, grasa: 60, desde: '2026-11-01' },
  { kcal: 1800, proteina: 100, carbohidratos: 200, grasa: 60, desde: '2026-11-12' },
];

// lunes 9 a domingo 15 de noviembre + lunes 16
const registros = [
  reg('2026-11-09', 'desayuno', 500), reg('2026-11-09', 'comida', 1500), // 2000 → cumple (meta 2000)
  reg('2026-11-10', 'comida', 2300), // +15 % → no cumple
  // 11: sin registros
  reg('2026-11-12', 'cena', 1900), // meta 1800: +5.6 % → cumple
  reg('2026-11-13', 'desayuno', 0), // registrado con 0 kcal: no cumple, cuenta en promedio
  reg('2026-11-16', 'cena', 1800),
];

describe('estadísticas', () => {
  it('día sin registros = null; día con 0 = registrado', () => {
    const s = serieDiaria(registros, metas, '2026-11-09', '2026-11-13');
    expect(s.map((d) => d.registrado)).toEqual([true, true, false, true, true]);
    expect(s[2].totales).toBeNull();
    expect(s[2].cumple).toBeNull();
    expect(s[4].totales?.kcal).toBe(0);
    expect(s[4].cumple).toBe(false);
    expect(s.map((d) => d.cumple)).toEqual([true, false, null, true, false]);
    expect(s[3].meta?.kcal).toBe(1800); // meta vigente ese día
  });

  it('promedios sobre días registrados, días registrados vs periodo, cumplimiento', () => {
    const e = estadisticasRango(registros, metas, '2026-11-09', '2026-11-15');
    expect(e.diasPeriodo).toBe(7);
    expect(e.diasRegistrados).toBe(4);
    expect(e.promedio?.kcal).toBe((2000 + 2300 + 1900 + 0) / 4);
    expect(e.total.kcal).toBe(6200);
    expect(e.diasConMeta).toBe(4);
    expect(e.diasCumplidos).toBe(2);
    expect(e.cumplimiento).toBe(0.5);
    expect(e.metaKcalPromedio).toBe((2000 + 2000 + 1800 + 1800) / 4);
    expect(e.promedioPorComida.desayuno.kcal).toBe(125);
    expect(e.promedioPorComida.colacion1.kcal).toBe(0);
    expect(e.rachaMaxima).toBe(2);
    expect(e.rachaActual).toBe(0);
  });

  it('tolerancia parametrizable y nutrientes a evaluar', () => {
    const e = estadisticasRango(registros, metas, '2026-11-09', '2026-11-15', { tolerancia: 0.2 });
    expect(e.diasCumplidos).toBe(3);
    expect(evaluarDia(t(2000), metas[0], { nutrientes: ['kcal', 'carbohidratos'] })).toBe(true);
    expect(evaluarDia(t(2000), metas[0], { nutrientes: ['proteina'] })).toBe(true);
    expect(evaluarDia(t(2000), { ...metas[0], kcal: 0 })).toBeNull();
    expect(evaluarDia(null, metas[0])).toBeNull();
  });

  it('semanal y mensual recortados al rango; `hoy` excluye días futuros', () => {
    const e = estadisticasRango(registros, metas, '2026-11-12', '2026-11-20', { hoy: '2026-11-16' });
    expect(e.hasta).toBe('2026-11-16');
    expect(e.diasPeriodo).toBe(5);
    expect(e.semanas.map((s) => [s.inicio, s.fin, s.diasPeriodo, s.diasRegistrados]))
      .toEqual([['2026-11-12', '2026-11-15', 4, 2], ['2026-11-16', '2026-11-16', 1, 1]]);
    expect(e.meses).toHaveLength(1);
    expect(e.meses[0].mes).toBe('2026-11');
    expect(e.rachaActual).toBe(1);
  });

  it('sin registros: promedio null y cumplimiento null', () => {
    const e = estadisticasRango([], [], '2026-11-01', '2026-11-07');
    expect(e.promedio).toBeNull();
    expect(e.cumplimiento).toBeNull();
    expect(e.diasRegistrados).toBe(0);
  });

  it('resumirDia agrupa por comida y calcula restante', () => {
    const base: Omit<RegistroComida, 'id' | 'fecha' | 'comida' | 'totales' | 'creado'> = {
      alimentoId: 'x', instantanea: { nombre: 'x', fuente: 'usuario', base: 'g', nutrientes: {}, porciones: [] },
      cantidad: 1, unidad: 'g', cantidadBase: 1, modificado: '' };
    const lista: RegistroComida[] = [
      { ...base, id: 'b', fecha: '2026-11-16', comida: 'cena', totales: t(500), creado: '2026-11-16T03:00:00Z' },
      { ...base, id: 'a', fecha: '2026-11-16', comida: 'cena', totales: t(300), creado: '2026-11-16T01:00:00Z' },
      { ...base, id: 'c', fecha: '2026-11-15', comida: 'cena', totales: t(300), creado: '2026-11-15T01:00:00Z' },
    ];
    const r = resumirDia('2026-11-16', lista, metas[1]);
    expect(r.porComida.cena.registros.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.porComida.cena.totales.kcal).toBe(800);
    expect(r.porComida.desayuno.registros).toEqual([]);
    expect(r.totales.kcal).toBe(800);
    expect(r.restante?.kcal).toBe(1000);
    expect(resumirDia('2026-11-14', lista, null).registrado).toBe(false);
  });
});
