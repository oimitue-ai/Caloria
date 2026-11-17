/// <reference types="node" />
/**
 * Regresiones de búsqueda encontradas en la auditoría (Agente 4) sobre el catálogo publicado real
 * (motor base en hilo principal, sin marcas = comportamiento sin conexión).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { crearServicioCatalogo, type ServicioCatalogoLocal } from '../src/catalogo/index.ts';

const RAIZ = join(process.cwd(), 'public', 'catalogo');
const leer = async (r: string) => {
  const p = join(RAIZ, r);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};
let s: ServicioCatalogoLocal;
beforeAll(async () => {
  s = crearServicioCatalogo({ cargador: leer, usarWorker: false });
  await s.iniciar();
});
const top = async (q: string, n = 5) => (await s.buscar(q, { limite: n, incluirMarcas: false })).resultados.map((r) => r.nombre);

describe('auditoría: relevancia de búsqueda', () => {
  it('"huevo" y "arroz" muestran el alimento básico en el top 5', async () => {
    expect(await top('huevo')).toContain('Huevo entero, crudo');
    expect(await top('arroz')).toContain('Arroz blanco, cocido');
    expect((await top('avena'))[0]).toMatch(/^Avena, cruda/);
  });
  it('"queso panela" sin conexión ya no devuelve azúcar morena (piloncillo)', async () => {
    expect(await top('queso panela')).not.toContain('Azúcar morena');
  });
  it('"concha" ofrece pan dulce con cobertura y no la base para pay', async () => {
    const r = await top('concha');
    expect(r).toContain('Pan dulce, con cobertura de azúcar');
    expect(r.some((n) => /pay/i.test(n))).toBe(false);
  });
  it('traducciones que cambiaban la identidad del alimento', async () => {
    const plat = await top('plátano', 10);
    expect(plat).not.toContain('Plátano partido');
    expect((await s.obtener('usda_fndds:2705660'))?.nombre).toBe('Banana split');
    expect((await s.obtener('usda_fndds:2710322'))?.nombre).toBe('Paleta de hielo');
    expect((await s.obtener('usda_fndds:2708017'))?.nombre).toBe('Base para pay');
    expect((await s.obtener('usda_sr_legacy:171900'))?.nombre).toMatch(/Ocean Spray/);
    expect((await s.obtener('usda_fndds:2710608'))?.nombre).toBe('Atole de chocolate');
  });
  it('el manifiesto conserva la sección de marcas (publicar --solo=base)', () => {
    expect(s.manifiesto() && Object.keys((s.manifiesto() as { marcas?: { fuentes: object } }).marcas?.fuentes ?? {})).toEqual(expect.arrayContaining(['usda_branded', 'off']));
  });
});
