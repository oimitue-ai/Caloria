import { describe, expect, it } from 'vitest';
import {
  AVISO_ORIENTATIVO, gastoEnergeticoTotal, metaVigenteEn, proponerMetas, repartirMacros, revisarMetas,
  tmbMifflinStJeor,
} from './metas';
import type { Perfil } from '../tipos';

const hombre: Perfil = { sexo: 'hombre', edad: 30, pesoActualKg: 80, estaturaCm: 175, actividad: 'sedentario' };

describe('Mifflin-St Jeor', () => {
  it('hombre 30 años 80 kg 175 cm = 1748.75', () => {
    expect(tmbMifflinStJeor({ sexo: 'hombre', edad: 30, pesoKg: 80, estaturaCm: 175 })).toBe(1748.75);
  });
  it('mujer 30 años 60 kg 165 cm = 1320.25', () => {
    expect(tmbMifflinStJeor({ sexo: 'mujer', edad: 30, pesoKg: 60, estaturaCm: 165 })).toBe(1320.25);
  });
  it('factores de actividad', () => {
    expect(gastoEnergeticoTotal(1000, 'sedentario')).toBe(1200);
    expect(gastoEnergeticoTotal(1000, 'ligero')).toBe(1375);
    expect(gastoEnergeticoTotal(1000, 'moderado')).toBe(1550);
    expect(gastoEnergeticoTotal(1000, 'activo')).toBe(1725);
    expect(gastoEnergeticoTotal(1000, 'muy_activo')).toBe(1900);
  });
});

describe('proponerMetas', () => {
  it('mantener: kcal = GET', () => {
    const p = proponerMetas({ ...hombre, objetivo: 'mantener' });
    if (!p.ok) throw new Error(p.mensaje);
    expect(p.get).toBe(2098.5);
    expect(p.metas.kcal).toBe(2099); // Math.round(2098.5)
    expect(p.avisos.at(-1)).toBe(AVISO_ORIENTATIVO);
    expect(AVISO_ORIENTATIVO).toMatch(/orientativa/);
    expect(AVISO_ORIENTATIVO).toMatch(/No son una prescripción médica/);
  });

  it('perder 0.5 kg/sem por defecto: −550 kcal/día (7700 kcal/kg)', () => {
    const p = proponerMetas({ ...hombre, actividad: 'moderado', objetivo: 'perder' });
    if (!p.ok) throw new Error();
    expect(p.ritmoKgSemana).toBe(0.5);
    expect(p.ajusteDiarioKcal).toBe(-550);
    expect(p.metas.kcal).toBe(Math.round(1748.75 * 1.55 - 550));
    expect(p.pisoAplicado).toBe(false);
  });

  it('ganar 0.25 kg/sem por defecto: +275 kcal/día', () => {
    const p = proponerMetas({ ...hombre, objetivo: 'ganar' });
    if (!p.ok) throw new Error();
    expect(p.ajusteDiarioKcal).toBe(275);
    expect(p.metas.kcal).toBe(Math.round(2098.5 + 275));
  });

  it('piso de seguridad 1200 mujer / 1500 hombre con aviso', () => {
    const m = proponerMetas({ sexo: 'mujer', edad: 60, pesoActualKg: 50, estaturaCm: 150, actividad: 'sedentario', objetivo: 'perder', ritmoKgSemana: 1 });
    if (!m.ok) throw new Error();
    expect(m.metas.kcal).toBe(1200);
    expect(m.pisoAplicado).toBe(true);
    expect(m.avisos.some((a) => a.includes('mínimo de seguridad de 1200'))).toBe(true);
    const h = proponerMetas({ ...hombre, pesoActualKg: 60, edad: 70, objetivo: 'perder', ritmoKgSemana: 1 });
    if (!h.ok) throw new Error();
    expect(h.metas.kcal).toBe(1500);
  });

  it('ritmo mayor al máximo se limita con aviso', () => {
    const p = proponerMetas({ ...hombre, objetivo: 'perder', ritmoKgSemana: 2 });
    if (!p.ok) throw new Error();
    expect(p.ritmoKgSemana).toBe(1);
    expect(p.avisos[0]).toMatch(/máximo recomendado/);
  });

  it('macros: proteína 1.6–2.0 g/kg, grasa 25–30 %, resto carbohidratos', () => {
    const p = proponerMetas({ ...hombre, objetivo: 'mantener' });
    if (!p.ok) throw new Error();
    const { kcal, proteina, grasa, carbohidratos } = p.metas;
    expect(proteina / 80).toBeGreaterThanOrEqual(1.6);
    expect(proteina / 80).toBeLessThanOrEqual(2.0);
    expect((grasa * 9) / kcal).toBeGreaterThanOrEqual(0.25 - 0.01);
    expect((grasa * 9) / kcal).toBeLessThanOrEqual(0.30 + 0.01);
    expect(Math.abs(proteina * 4 + carbohidratos * 4 + grasa * 9 - kcal)).toBeLessThanOrEqual(6);
    const r = repartirMacros(2000, 80, { proteinaGKg: 2, grasaFraccion: 0.3 });
    expect(r).toEqual({ proteina: 160, grasa: 67, carbohidratos: 189, avisos: [] });
  });

  it('perfil incompleto', () => {
    const p = proponerMetas({ sexo: 'hombre' });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.faltantes).toEqual(['edad', 'estatura', 'peso actual', 'nivel de actividad']);
  });
});

describe('metaVigenteEn y revisarMetas', () => {
  const hist = [
    { kcal: 2000, proteina: 0, carbohidratos: 0, grasa: 0, desde: '2026-01-01' },
    { kcal: 1800, proteina: 0, carbohidratos: 0, grasa: 0, desde: '2026-03-01' },
  ];
  it('elige la más reciente no posterior', () => {
    expect(metaVigenteEn(hist, '2025-12-31')).toBeNull();
    expect(metaVigenteEn(hist, '2026-02-28')?.kcal).toBe(2000);
    expect(metaVigenteEn(hist, '2026-03-01')?.kcal).toBe(1800);
  });
  it('avisa incoherencias', () => {
    expect(revisarMetas({ kcal: 2000, proteina: 150, carbohidratos: 200, grasa: 67 })).toEqual([]);
    expect(revisarMetas({ kcal: 1000, proteina: 50, carbohidratos: 100, grasa: 40 }, 'hombre')).toHaveLength(1);
    expect(revisarMetas({ kcal: 2000, proteina: 50, carbohidratos: 100, grasa: 40 })[0]).toMatch(/suman 960 kcal/);
  });
});
