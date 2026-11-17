/**
 * Alimentos personalizados, caché de alimentos de catálogo, favoritos, recientes y frecuentes.
 */
import type { Alimento, BaseNutricional, ComidaId, Nutrientes, Porcion } from '../tipos';
import { ahoraISO } from '../nucleo/fechas';
import { instantaneaDe } from '../nucleo/instantanea';
import { recetaComoAlimento } from '../nucleo/recetas';
import Dexie from 'dexie';
import { bd, nuevoId } from './esquema';
import type { AlimentoEnCache, Favorito, UsoAlimento } from './tipos';
import { ErrorDatos } from './tipos';
import { esquemaAlimento, validar } from './validacion';

// ───────────── Alimentos personalizados ─────────────

export interface DatosAlimentoUsuario {
  nombre: string;
  base: BaseNutricional;
  /** por 100 g o 100 ml según `base` */
  nutrientes: Nutrientes;
  porciones?: Porcion[];
  densidad?: number;
  marca?: string;
  categoria?: string;
  codigoBarras?: string;
  sinonimos?: string[];
  notas?: string;
}

function sinIndefinidos<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Crea un alimento propio (fuente 'usuario', id `usuario:<uuid>`). */
export async function crearAlimentoUsuario(datos: DatosAlimentoUsuario): Promise<Alimento> {
  const uuid = nuevoId();
  const a = validar(esquemaAlimento, sinIndefinidos({
    porciones: [],
    ...datos,
    nombre: datos.nombre?.trim(),
    id: `usuario:${uuid}`,
    fuente: 'usuario',
    idOriginal: uuid,
    nombreOriginal: datos.nombre?.trim(),
    idiomaOriginal: 'es',
    validacion: 'usuario',
    actualizado: ahoraISO(),
  }), 'Alimento');
  await bd().alimentosUsuario.add(a);
  return a;
}

/**
 * Edita un alimento propio. Los registros y recetas que ya lo usan NO cambian: guardan una
 * instantánea. Pasar `undefined` en un campo opcional lo elimina.
 */
export async function editarAlimentoUsuario(id: string, cambios: Partial<DatosAlimentoUsuario>): Promise<Alimento> {
  const b = bd();
  return b.transaction('rw', [b.alimentosUsuario, b.favoritos], async () => {
    const actual = await b.alimentosUsuario.get(id);
    if (!actual) throw new ErrorDatos('El alimento ya no existe.');
    const nombre = cambios.nombre !== undefined ? cambios.nombre.trim() : actual.nombre;
    const nuevo = validar(esquemaAlimento, sinIndefinidos({
      ...actual, ...cambios, nombre, nombreOriginal: nombre, id: actual.id, fuente: 'usuario', actualizado: ahoraISO(),
    }), 'Alimento');
    await b.alimentosUsuario.put(nuevo);
    // el favorito muestra la versión actual (no es historial)
    const fav = await b.favoritos.get(id);
    if (fav) await b.favoritos.put({ ...fav, nombre: nuevo.nombre, instantanea: instantaneaDe(nuevo) });
    return nuevo;
  });
}

/** Elimina un alimento propio (y su favorito/recientes). Los registros conservan su instantánea. */
export async function eliminarAlimentoUsuario(id: string): Promise<void> {
  const b = bd();
  await b.transaction('rw', [b.alimentosUsuario, b.favoritos, b.usos], async () => {
    await b.alimentosUsuario.delete(id);
    await b.favoritos.delete(id);
    await b.usos.where('alimentoId').equals(id).delete();
  });
}

export async function obtenerAlimentoUsuario(id: string): Promise<Alimento | undefined> {
  return bd().alimentosUsuario.get(id);
}

/** Alimentos propios ordenados por nombre. */
export async function listarAlimentosUsuario(): Promise<Alimento[]> {
  return bd().alimentosUsuario.orderBy('nombre').toArray();
}

// ───────────── Búsqueda local ─────────────

/** minúsculas sin acentos ni signos */
export function normalizarTexto(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Busca en alimentos propios, recetas y caché de catálogo (sin conexión). Coincidencia por
 * palabras (todas deben aparecer), sin acentos. Primero los que empiezan con el texto.
 */
export async function buscarAlimentosLocales(
  texto: string, opciones: { limite?: number; incluirCache?: boolean } = {},
): Promise<Alimento[]> {
  const palabras = normalizarTexto(texto).split(' ').filter(Boolean);
  const b = bd();
  const [propios, recetas, cache] = await Promise.all([
    b.alimentosUsuario.toArray(),
    b.recetas.toArray(),
    opciones.incluirCache === false ? Promise.resolve([] as AlimentoEnCache[]) : b.cacheAlimentos.toArray(),
  ]);
  const candidatos: Alimento[] = [...propios];
  for (const r of recetas) {
    try { candidatos.push(recetaComoAlimento(r)); } catch { /* receta inválida: se omite */ }
  }
  candidatos.push(...cache.map((c) => c.alimento));
  const puntuados: { a: Alimento; p: number }[] = [];
  for (const a of candidatos) {
    const heno = normalizarTexto([a.nombre, a.marca, ...(a.sinonimos ?? [])].filter(Boolean).join(' '));
    if (!palabras.every((w) => heno.includes(w))) continue;
    const nombre = normalizarTexto(a.nombre);
    const p = (nombre.startsWith(palabras.join(' ')) ? 2 : 0) + (a.fuente === 'usuario' || a.fuente === 'receta' ? 1 : 0);
    puntuados.push({ a, p });
  }
  puntuados.sort((x, y) => y.p - x.p || x.a.nombre.localeCompare(y.a.nombre, 'es'));
  return puntuados.slice(0, opciones.limite ?? 25).map((x) => x.a);
}

/**
 * Busca un alimento por id en los datos locales: propios (`usuario:`), recetas (`receta:`)
 * o caché de catálogo. Para el resto, la interfaz consulta el catálogo.
 */
export async function obtenerAlimentoLocal(id: string): Promise<Alimento | undefined> {
  const b = bd();
  if (id.startsWith('usuario:')) return b.alimentosUsuario.get(id);
  if (id.startsWith('receta:')) {
    const r = await b.recetas.get(id.slice('receta:'.length));
    return r ? recetaComoAlimento(r) : undefined;
  }
  return (await b.cacheAlimentos.get(id))?.alimento;
}

/** Código de barras en alimentos propios y en la caché (sin conexión). */
export async function buscarCodigoBarrasLocal(codigo: string): Promise<Alimento | undefined> {
  const b = bd();
  const propio = await b.alimentosUsuario.where('codigoBarras').equals(codigo).first();
  if (propio) return propio;
  return (await b.cacheAlimentos.where('alimento.codigoBarras').equals(codigo).first())?.alimento;
}

// ───────────── Caché de catálogo ─────────────

/** Guarda (o actualiza) un alimento de catálogo para tenerlo sin conexión. */
export async function guardarEnCache(alimento: Alimento): Promise<void> {
  const a = validar(esquemaAlimento, alimento, 'Alimento');
  await bd().cacheAlimentos.put({ id: a.id, alimento: a, ultimoUso: ahoraISO() });
}

/**
 * Deja como máximo `maximo` alimentos en la caché (borra los usados hace más tiempo), sin
 * borrar favoritos. Devuelve cuántos borró.
 */
export async function podarCache(maximo = 3000): Promise<number> {
  const b = bd();
  return b.transaction('rw', [b.cacheAlimentos, b.favoritos], async () => {
    const total = await b.cacheAlimentos.count();
    if (total <= maximo) return 0;
    const favoritos = new Set((await b.favoritos.toCollection().primaryKeys()) as string[]);
    const viejos = await b.cacheAlimentos.orderBy('ultimoUso').primaryKeys();
    const borrar = (viejos as string[]).filter((id) => !favoritos.has(id)).slice(0, total - maximo);
    await b.cacheAlimentos.bulkDelete(borrar);
    return borrar.length;
  });
}

// ───────────── Favoritos ─────────────

export async function listarFavoritos(): Promise<Favorito[]> {
  const lista = await bd().favoritos.toArray();
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export async function esFavorito(alimentoId: string): Promise<boolean> {
  return (await bd().favoritos.get(alimentoId)) !== undefined;
}

export async function agregarFavorito(alimento: Alimento): Promise<Favorito> {
  const b = bd();
  const fav: Favorito = {
    alimentoId: alimento.id,
    nombre: alimento.nombre,
    instantanea: instantaneaDe(alimento),
    creado: ahoraISO(),
  };
  if (alimento.marca !== undefined) fav.marca = alimento.marca;
  await b.transaction('rw', [b.favoritos, b.cacheAlimentos], async () => {
    await b.favoritos.put(fav);
    if (alimento.fuente !== 'usuario' && alimento.fuente !== 'receta') {
      await b.cacheAlimentos.put({ id: alimento.id, alimento, ultimoUso: fav.creado });
    }
  });
  return fav;
}

export async function quitarFavorito(alimentoId: string): Promise<void> {
  await bd().favoritos.delete(alimentoId);
}

/** Marca o desmarca. Devuelve el estado nuevo (true = favorito). */
export async function alternarFavorito(alimento: Alimento): Promise<boolean> {
  if (await esFavorito(alimento.id)) {
    await quitarFavorito(alimento.id);
    return false;
  }
  await agregarFavorito(alimento);
  return true;
}

// ───────────── Recientes y frecuentes ─────────────

function unoPorAlimento(lista: UsoAlimento[]): UsoAlimento[] {
  const vistos = new Set<string>();
  return lista.filter((u) => (vistos.has(u.alimentoId) ? false : (vistos.add(u.alimentoId), true)));
}

/**
 * Últimos alimentos usados. Con `comida`, los de esa comida (con su última cantidad/unidad en
 * esa comida); sin ella, de todas (uno por alimento).
 */
export async function listarRecientes(comida?: ComidaId, limite = 20): Promise<UsoAlimento[]> {
  const t = bd().usos;
  if (comida) {
    return t.where('[comida+ultimoUso]').between([comida, Dexie.minKey], [comida, Dexie.maxKey])
      .reverse().limit(limite).toArray();
  }
  return unoPorAlimento(await t.orderBy('ultimoUso').reverse().toArray()).slice(0, limite);
}

/**
 * Alimentos más usados. Con `comida`, por número de usos en esa comida; sin ella, sumando
 * todas las comidas (la cantidad/unidad es la del uso más reciente).
 */
export async function listarFrecuentes(comida?: ComidaId, limite = 20): Promise<UsoAlimento[]> {
  const t = bd().usos;
  if (comida) {
    const lista = await t.where('comida').equals(comida).toArray();
    return lista.sort((a, b) => b.usos - a.usos || (a.ultimoUso < b.ultimoUso ? 1 : -1)).slice(0, limite);
  }
  const porAlimento = new Map<string, UsoAlimento>();
  for (const u of await t.toArray()) {
    const p = porAlimento.get(u.alimentoId);
    if (!p) porAlimento.set(u.alimentoId, { ...u });
    else {
      const masReciente = u.ultimoUso > p.ultimoUso ? u : p;
      porAlimento.set(u.alimentoId, { ...masReciente, usos: p.usos + u.usos });
    }
  }
  return [...porAlimento.values()]
    .sort((a, b) => b.usos - a.usos || (a.ultimoUso < b.ultimoUso ? 1 : -1)).slice(0, limite);
}

/** Olvida un alimento de recientes/frecuentes (en una comida o en todas). */
export async function olvidarUso(alimentoId: string, comida?: ComidaId): Promise<void> {
  const t = bd().usos;
  if (comida) await t.delete([alimentoId, comida]);
  else await t.where('alimentoId').equals(alimentoId).delete();
}
