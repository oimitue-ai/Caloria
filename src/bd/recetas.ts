/** Recetas del usuario. Los ingredientes guardan instantánea; ver nucleo/recetas para el cálculo. */
import type { Alimento, IngredienteReceta, Receta } from '../tipos';
import { ahoraISO } from '../nucleo/fechas';
import { instantaneaDe } from '../nucleo/instantanea';
import { recetaComoAlimento } from '../nucleo/recetas';
import { bd, nuevoId } from './esquema';
import { ErrorDatos } from './tipos';
import { esquemaReceta, validar } from './validacion';

export interface DatosReceta {
  nombre: string;
  /** usa `crearIngrediente` de nucleo/recetas para armarlos */
  ingredientes: IngredienteReceta[];
  porciones: number;
  pesoFinalG?: number;
  notas?: string;
}

function comprobar(r: Receta): Receta {
  const v = validar(esquemaReceta, r, 'Receta');
  recetaComoAlimento(v); // lanza si no se puede calcular
  return v;
}

export async function crearReceta(datos: DatosReceta): Promise<Receta> {
  const ahora = ahoraISO();
  const r: Receta = {
    id: nuevoId(),
    nombre: datos.nombre?.trim(),
    ingredientes: datos.ingredientes.map((i) => ({ ...i, instantanea: instantaneaDe(i.instantanea) })),
    porciones: datos.porciones,
    creado: ahora,
    modificado: ahora,
  };
  if (datos.pesoFinalG !== undefined) r.pesoFinalG = datos.pesoFinalG;
  if (datos.notas) r.notas = datos.notas;
  const v = comprobar(r);
  await bd().recetas.add(v);
  return v;
}

/**
 * Edita una receta. Los registros ya hechos con ella NO cambian (guardan instantánea).
 * `pesoFinalG: undefined` lo quita.
 */
export async function editarReceta(id: string, cambios: Partial<DatosReceta>): Promise<Receta> {
  const b = bd();
  return b.transaction('rw', [b.recetas, b.favoritos], async () => {
    const actual = await b.recetas.get(id);
    if (!actual) throw new ErrorDatos('La receta ya no existe.');
    const nueva: Receta = { ...actual, ...cambios, id, creado: actual.creado, modificado: ahoraISO() };
    if (cambios.nombre !== undefined) nueva.nombre = cambios.nombre.trim();
    for (const k of ['pesoFinalG', 'notas'] as const) if (k in cambios && cambios[k] === undefined) delete nueva[k];
    const v = comprobar(nueva);
    await b.recetas.put(v);
    const fav = await b.favoritos.get(`receta:${id}`);
    if (fav) {
      const a = recetaComoAlimento(v);
      await b.favoritos.put({ ...fav, nombre: a.nombre, instantanea: instantaneaDe(a) });
    }
    return v;
  });
}

export async function eliminarReceta(id: string): Promise<void> {
  const b = bd();
  await b.transaction('rw', [b.recetas, b.favoritos, b.usos], async () => {
    await b.recetas.delete(id);
    await b.favoritos.delete(`receta:${id}`);
    await b.usos.where('alimentoId').equals(`receta:${id}`).delete();
  });
}

export async function obtenerReceta(id: string): Promise<Receta | undefined> {
  return bd().recetas.get(id);
}

/** Recetas ordenadas por nombre. */
export async function listarRecetas(): Promise<Receta[]> {
  return bd().recetas.orderBy('nombre').toArray();
}

/** La receta lista para registrarse (`agregarRegistro({ alimento, … })`). */
export async function recetaRegistrable(id: string): Promise<Alimento | undefined> {
  const r = await obtenerReceta(id);
  return r ? recetaComoAlimento(r) : undefined;
}

/** Duplica una receta con otro nombre (para variantes). */
export async function duplicarReceta(id: string, nombre?: string): Promise<Receta> {
  const r = await obtenerReceta(id);
  if (!r) throw new ErrorDatos('La receta ya no existe.');
  return crearReceta({
    nombre: nombre ?? `${r.nombre} (copia)`,
    ingredientes: structuredClone(r.ingredientes),
    porciones: r.porciones,
    ...(r.pesoFinalG !== undefined ? { pesoFinalG: r.pesoFinalG } : {}),
    ...(r.notas !== undefined ? { notas: r.notas } : {}),
  });
}
