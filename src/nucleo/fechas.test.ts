import { describe, expect, it } from 'vitest';
import {
  diaSemana, diasEntre, esFechaValida, fechaEnZona, fechaLocal, finMes, formatearFechaLarga, inicioSemana,
  mesesEnRango, rangoFechas, semanasEnRango, sumarDias, sumarMeses,
} from './fechas';

describe('fechas locales', () => {
  it('fechaLocal usa componentes locales, no UTC', () => {
    const d = new Date(2026, 10, 16, 23, 30); // 16 nov 23:30 hora local
    expect(fechaLocal(d)).toBe('2026-11-16');
  });
  it('20:00 en Ciudad de México sigue siendo el mismo día (toISOString ya sería el siguiente)', () => {
    const instante = new Date('2026-11-17T02:00:00Z'); // 20:00 del 16 en CDMX (UTC−6)
    expect(instante.toISOString().slice(0, 10)).toBe('2026-11-17');
    expect(fechaEnZona(instante, 'America/Mexico_City')).toBe('2026-11-16');
  });
  it('aritmética de calendario', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2024-03-01', -1)).toBe('2024-02-29');
    expect(diasEntre('2026-01-01', '2026-12-31')).toBe(364);
    expect(rangoFechas('2026-11-14', '2026-11-16')).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
    expect(rangoFechas('2026-11-16', '2026-11-14')).toEqual([]);
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(finMes('2028-02-10')).toBe('2028-02-29');
  });
  it('semanas lunes–domingo', () => {
    expect(diaSemana('2026-11-16')).toBe(0); // lunes
    expect(diaSemana('2026-11-22')).toBe(6); // domingo
    expect(inicioSemana('2026-11-22')).toBe('2026-11-16');
    expect(semanasEnRango('2026-11-01', '2026-11-16').map((s) => s.inicio))
      .toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
    expect(mesesEnRango('2026-11-20', '2027-01-05').map((m) => m.mes)).toEqual(['2026-11', '2026-12', '2027-01']);
  });
  it('validación y formato', () => {
    expect(esFechaValida('2026-02-29')).toBe(false);
    expect(esFechaValida('2028-02-29')).toBe(true);
    expect(esFechaValida('2026-1-01')).toBe(false);
    expect(formatearFechaLarga('2026-11-16')).toBe('lunes 16 de noviembre de 2026');
  });
});
