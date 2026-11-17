/**
 * Resolución de un token de la consulta contra un vocabulario: exacto, prefijo (al teclear),
 * fonética española y distancia de edición acotada. Compartido por el motor base y el de marcas.
 */
import { distanciaEdicion, fonetica } from './normalizar.ts';

export interface TerminoResuelto {
  termino: string;
  peso: number;
}

export interface Vocabulario {
  /** frecuencia documental del término (0 si no existe) */
  df(t: string): number;
  /** términos que empiezan con `p` (ordenados por df desc), hasta `max` */
  conPrefijo(p: string, max: number): string[];
  /** términos candidatos para corrección difusa (misma longitud ±2) */
  candidatos(t: string): Iterable<string>;
  /** términos con la misma clave fonética */
  porFonetica?(clave: string): string[] | undefined;
}

export function resolverToken(t: string, voc: Vocabulario, prefijo: boolean): TerminoResuelto[] {
  const res = new Map<string, number>();
  const poner = (x: string, p: number) => {
    if ((res.get(x) ?? 0) < p) res.set(x, p);
  };
  const existe = voc.df(t) > 0;
  if (existe) poner(t, 1);
  if (prefijo && t.length >= 2) {
    for (const x of voc.conPrefijo(t, t.length >= 4 ? 12 : 8)) if (x !== t) poner(x, 0.8 - Math.min(0.2, (x.length - t.length) * 0.02));
  }
  if (!existe || t.length >= 5) {
    // fonética (z/s/c, v/b, ll/y, h): "quezo" → "queso"
    const f = fonetica(t);
    for (const x of voc.porFonetica?.(f) ?? []) if (x !== t) poner(x, existe ? 0.6 : 0.85);
  }
  if (!existe && t.length >= 4) {
    const max = t.length >= 8 ? 2 : 1;
    let n = 0;
    for (const x of voc.candidatos(t)) {
      if (x === t || Math.abs(x.length - t.length) > max) continue;
      const d = distanciaEdicion(t, x, max);
      if (d <= max) {
        // se omiten letras más a menudo de lo que se añaden: candidato más largo, un poco mejor
        poner(x, (d === 1 ? 0.72 : 0.55) + (x.length > t.length ? 0.03 : x.length < t.length ? -0.05 : 0));
        if (++n > 40) break;
      }
    }
    // prefijo con error en la última letra al teclear: "tortil" ya lo cubre conPrefijo; "platno" ↔ "platano" por edición
  }
  return [...res].map(([termino, peso]) => ({ termino, peso })).sort((a, b) => b.peso - a.peso).slice(0, 24);
}
