import { describe, expect, it } from 'vitest';
import { convertirABase, describirCantidad, unidadesDisponibles, unidadPredeterminada } from './unidades';
import { instantaneaDe } from './instantanea';
import { avena, leche, lecheSinDensidad, platano } from './pruebas/fixtures';

describe('convertirABase', () => {
  it('g y kg sobre base g', () => {
    expect(convertirABase(platano, 150, 'g')).toEqual({ ok: true, cantidadBase: 150 });
    expect(convertirABase(platano, 0.25, 'kg')).toEqual({ ok: true, cantidadBase: 250 });
  });

  it('1 taza de leche = 240 ml; l, cucharada y cucharadita', () => {
    expect(convertirABase(leche, 1, 'taza')).toEqual({ ok: true, cantidadBase: 240 });
    expect(convertirABase(leche, 0.5, 'l')).toEqual({ ok: true, cantidadBase: 500 });
    expect(convertirABase(leche, 2, 'cucharada')).toEqual({ ok: true, cantidadBase: 30 });
    expect(convertirABase(leche, 3, 'cucharadita')).toEqual({ ok: true, cantidadBase: 15 });
  });

  it('2 piezas de 118 g = 236 g (porción predeterminada o por etiqueta)', () => {
    const r = convertirABase(platano, 2, 'pieza');
    expect(r.ok && r.cantidadBase).toBe(236);
    const g = convertirABase(platano, 2, 'pieza', '1 pieza grande (136 g)');
    expect(g.ok && g.cantidadBase).toBe(272);
  });

  it('la taza del alimento (porción) tiene prioridad sobre 240 ml', () => {
    const r = convertirABase(platano, 1, 'taza');
    expect(r.ok && r.cantidadBase).toBe(150);
  });

  it('ml → g sin densidad falla; con densidad 1.03 funciona', () => {
    const avenaMl = convertirABase(avena, 100, 'ml');
    expect(avenaMl.ok).toBe(false);
    if (!avenaMl.ok) expect(avenaMl.motivo).toMatch(/densidad/);
    const conDensidad = { ...avena, densidad: 1.03, porciones: [] };
    expect(convertirABase(conDensidad, 100, 'ml')).toEqual({ ok: true, cantidadBase: 103 });
    expect(convertirABase(conDensidad, 1, 'taza')).toEqual({ ok: true, cantidadBase: 247.2 });
  });

  it('g → ml sin densidad falla (no asume 1 g/ml); con densidad funciona', () => {
    expect(convertirABase(lecheSinDensidad, 100, 'g').ok).toBe(false);
    const r = convertirABase(leche, 103, 'g');
    expect(r.ok && r.cantidadBase).toBeCloseTo(100, 6);
  });

  it('pieza/porcion sin porción definida no se convierten', () => {
    expect(convertirABase(leche, 1, 'pieza').ok).toBe(false);
    expect(convertirABase(avena, 1, 'porcion').ok).toBe(false);
  });

  it('cantidad inválida y etiqueta inexistente', () => {
    expect(convertirABase(platano, 0, 'g').ok).toBe(false);
    expect(convertirABase(platano, -1, 'g').ok).toBe(false);
    expect(convertirABase(platano, Number.NaN, 'g').ok).toBe(false);
    // etiqueta inexistente → cae a la porción predeterminada de esa unidad
    const r = convertirABase(platano, 1, 'pieza', 'no existe');
    expect(r.ok && r.cantidadBase).toBe(118);
  });

  it('soloPorciones: solo acepta sus porciones', () => {
    const receta = {
      base: 'g' as const, soloPorciones: true,
      porciones: [{ etiqueta: '1 porción', unidad: 'porcion' as const, equivalencia: 194 }],
    };
    expect(convertirABase(receta, 1, 'g').ok).toBe(false);
    expect(convertirABase(receta, 2, 'porcion')).toMatchObject({ ok: true, cantidadBase: 388 });
    expect(unidadesDisponibles(receta).map((o) => o.unidad)).toEqual(['porcion']);
  });

  it('funciona con una instantánea', () => {
    const inst = instantaneaDe(platano);
    expect(convertirABase(inst, 1, 'pieza')).toMatchObject({ ok: true, cantidadBase: 118 });
  });
});

describe('unidadesDisponibles', () => {
  it('plátano: porciones (cada una distinta) + g/kg; sin ml ni medidas de volumen', () => {
    const op = unidadesDisponibles(platano);
    expect(op[0]).toMatchObject({ unidad: 'pieza', porcionEtiqueta: '1 pieza mediana (118 g)', predeterminada: true });
    expect(op.filter((o) => o.unidad === 'pieza')).toHaveLength(2);
    const unidades = op.map((o) => o.unidad);
    expect(unidades).toContain('g');
    expect(unidades).toContain('kg');
    expect(unidades).not.toContain('ml');
    expect(unidades).not.toContain('cucharada');
    // la taza solo aparece como su porción, no como 240 ml
    expect(op.filter((o) => o.unidad === 'taza')).toHaveLength(1);
  });

  it('leche sin densidad: solo volumen; con densidad agrega g/kg', () => {
    const sin = unidadesDisponibles(lecheSinDensidad).map((o) => o.unidad);
    expect(sin).toEqual(['ml', 'l', 'taza', 'cucharada', 'cucharadita']);
    const con = unidadesDisponibles(leche).map((o) => o.unidad);
    expect(con).toEqual(['ml', 'l', 'taza', 'cucharada', 'cucharadita', 'g', 'kg']);
  });

  it('toda opción ofrecida es convertible', () => {
    for (const a of [platano, leche, lecheSinDensidad, avena]) {
      for (const o of unidadesDisponibles(a)) {
        const r = convertirABase(a, 1, o.unidad, o.porcionEtiqueta);
        expect(r.ok, `${a.nombre} ${o.etiqueta}`).toBe(true);
        if (r.ok) expect(r.cantidadBase).toBe(o.equivalencia);
      }
    }
  });

  it('unidadPredeterminada y describirCantidad', () => {
    expect(unidadPredeterminada(platano)?.unidad).toBe('pieza');
    expect(unidadPredeterminada(lecheSinDensidad)?.unidad).toBe('ml');
    expect(describirCantidad(150, 'g')).toBe('150 g');
    expect(describirCantidad(2, 'taza')).toBe('2 tazas');
    expect(describirCantidad(1, 'taza')).toBe('1 taza');
    expect(describirCantidad(2, 'pieza', '1 pieza mediana (118 g)')).toBe('2 × 1 pieza mediana (118 g)');
  });
});
