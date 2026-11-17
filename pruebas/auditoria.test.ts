/** Regresiones de la auditoría (Agente 4) en el núcleo. */
import { describe, expect, it } from 'vitest';
import { convertirABase, MAXIMO_CANTIDAD_BASE } from '../src/nucleo/unidades.ts';

const platano = { base: 'g' as const, porciones: [{ etiqueta: '1 pieza mediana (118 g)', unidad: 'pieza' as const, equivalencia: 118, predeterminada: true }] };

describe('auditoría: límites de cantidad', () => {
  it('rechaza cantidades absurdas (1e300 piezas, 999 999 piezas)', () => {
    for (const c of [1e300, 999999]) {
      const r = convertirABase(platano, c, 'pieza');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toMatch(/demasiado grande/);
    }
  });
  it('acepta cantidades grandes pero plausibles (hasta 100 kg / 100 l)', () => {
    expect(convertirABase(platano, 50, 'pieza')).toMatchObject({ ok: true, cantidadBase: 5900 });
    expect(convertirABase(platano, MAXIMO_CANTIDAD_BASE, 'g')).toMatchObject({ ok: true });
    expect(convertirABase(platano, 100.001, 'kg').ok).toBe(false);
  });
  it('sigue rechazando 0, negativos y NaN', () => {
    for (const c of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(convertirABase(platano, c, 'g').ok).toBe(false);
  });
});
