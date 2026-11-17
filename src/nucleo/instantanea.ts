import type { Alimento, RegistroComida } from '../tipos';

export type Instantanea = RegistroComida['instantanea'];

/**
 * Copia profunda e independiente de los datos del alimento que un registro necesita
 * conservar. Editar después el alimento no altera la instantánea.
 */
export function instantaneaDe(alimento: Instantanea | Alimento): Instantanea {
  const n = alimento.nutrientes;
  const r: Instantanea = {
    nombre: alimento.nombre,
    fuente: alimento.fuente,
    base: alimento.base,
    nutrientes: { ...n, ...(n.micros ? { micros: { ...n.micros } } : {}) },
    porciones: (alimento.porciones ?? []).map((p) => ({ ...p })),
  };
  if (alimento.marca !== undefined) r.marca = alimento.marca;
  if (alimento.densidad !== undefined) r.densidad = alimento.densidad;
  if (alimento.soloPorciones) r.soloPorciones = true;
  return r;
}
