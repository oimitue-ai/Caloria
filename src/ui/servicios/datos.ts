/**
 * Adaptador fino entre la interfaz y la persistencia (Agente 2, `src/bd`).
 * Todas las pantallas leen y escriben datos SOLO a través de este módulo; si cambia la API
 * pública de `src/bd`, se ajusta aquí y no en cada pantalla.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import * as bd from '../../bd';
import type { Alimento, ComidaId } from '../../tipos';
import { codigoEnCatalogo, obtenerDeCatalogo } from './catalogo';

export * from '../../bd';

const esLocal = (id: string) => id.startsWith('usuario:') || id.startsWith('receta:');

/**
 * Alimento completo por id: propios y recetas desde la BD; del catálogo se pide al catálogo
 * y, si no hay conexión, se usa la copia guardada al registrarlo antes.
 */
export async function obtenerAlimento(id: string): Promise<Alimento | null> {
  if (esLocal(id)) return (await bd.obtenerAlimentoLocal(id)) ?? null;
  try {
    const a = await obtenerDeCatalogo(id);
    if (a) return a;
  } catch { /* sin conexión o catálogo no disponible */ }
  return (await bd.obtenerAlimentoLocal(id)) ?? null;
}

/** Código de barras: primero tus alimentos y la caché local, luego el catálogo. */
export async function buscarPorCodigo(codigo: string): Promise<Alimento | null> {
  const local = await bd.buscarCodigoBarrasLocal(codigo);
  if (local) return local;
  try {
    return await codigoEnCatalogo(codigo);
  } catch {
    return null;
  }
}

// ───────── Hooks adicionales de la interfaz ─────────

export function useRegistrosComida(fecha: string, comida: ComidaId) {
  return useLiveQuery(() => bd.registrosDeComida(fecha, comida), [fecha, comida]);
}

/** Recientes, frecuentes (≥ 2 usos) y favoritos para la hoja de registro. */
export function useSugerencias(comida: ComidaId) {
  return useLiveQuery(async () => {
    const [recientes, frecuentes, favoritos] = await Promise.all([
      bd.listarRecientes(comida, 25),
      bd.listarFrecuentes(comida, 25),
      bd.listarFavoritos(),
    ]);
    // Si en esta comida todavía hay poco historial, completa con lo reciente de otras comidas.
    const globales = recientes.length < 5 ? await bd.listarRecientes(undefined, 25) : [];
    const vistos = new Set(recientes.map((r) => r.alimentoId));
    return {
      recientes: [...recientes, ...globales.filter((r) => !vistos.has(r.alimentoId))].slice(0, 25),
      frecuentes: frecuentes.filter((f) => f.usos > 1),
      favoritos,
    };
  }, [comida]);
}

export function useEsFavorito(id: string | undefined) {
  return useLiveQuery(() => (id ? bd.esFavorito(id) : Promise.resolve(false)), [id]);
}

export function usePesoDeFecha(fecha: string) {
  return useLiveQuery(async () => (await bd.pesoDeFecha(fecha)) ?? null, [fecha]);
}
