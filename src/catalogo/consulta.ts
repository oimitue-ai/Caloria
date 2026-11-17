/**
 * Análisis de la consulta: tokens → grupos de alternativas (sinónimos, frases de varias palabras).
 * Cada grupo debe satisfacerse (AND); dentro del grupo basta una alternativa (OR); una alternativa
 * puede exigir varios tokens ("leche deslactosada" ↔ "lactose free").
 */
import { tokenizar } from './normalizar.ts';
import { GRUPOS_SINONIMOS } from './sinonimos.ts';

export interface Alternativa {
  tokens: string[];
  peso: number;
}
export interface GrupoConsulta {
  /** tokens originales de la consulta que cubre este grupo */
  original: string[];
  alternativas: Alternativa[];
  /** true si el grupo incluye el último token y este puede estar incompleto (búsqueda al teclear) */
  prefijo: boolean;
}

interface EntradaSinonimo {
  grupo: number;
  tokens: string[];
}

let indiceSinonimos: Map<string, EntradaSinonimo[]> | null = null;
let gruposTokenizados: string[][][] = [];
let maxLargo = 1;

function prepararSinonimos() {
  if (indiceSinonimos) return indiceSinonimos;
  indiceSinonimos = new Map();
  gruposTokenizados = GRUPOS_SINONIMOS.map((g) => g.map((t) => tokenizar(t)).filter((t) => t.length));
  gruposTokenizados.forEach((g, gi) => {
    for (const toks of g) {
      const k = toks.join(' ');
      maxLargo = Math.max(maxLargo, toks.length);
      const l = indiceSinonimos!.get(k) ?? [];
      if (!l.some((e) => e.grupo === gi)) l.push({ grupo: gi, tokens: toks });
      indiceSinonimos!.set(k, l);
    }
  });
  return indiceSinonimos;
}

/** Alternativas sinónimas de una secuencia de tokens (incluida ella misma con peso 1). */
function alternativasDe(toks: string[]): Alternativa[] {
  const idx = prepararSinonimos();
  const k = toks.join(' ');
  const res = new Map<string, Alternativa>();
  res.set(k, { tokens: toks, peso: 1 });
  for (const e of idx.get(k) ?? []) {
    for (const alt of gruposTokenizados[e.grupo]) {
      const ak = alt.join(' ');
      if (!res.has(ak)) res.set(ak, { tokens: alt, peso: 0.88 });
    }
  }
  return [...res.values()];
}

export function analizarConsulta(texto: string): GrupoConsulta[] {
  const toks = tokenizar(texto);
  if (!toks.length) return [];
  const terminaEnEspacio = /\s$/.test(texto);
  const idx = prepararSinonimos();
  const grupos: GrupoConsulta[] = [];
  let i = 0;
  while (i < toks.length) {
    let usado = 1;
    // frase de sinónimos más larga que empiece aquí (mín. 2 palabras)
    for (let n = Math.min(maxLargo, toks.length - i); n >= 2; n--) {
      if (idx.has(toks.slice(i, i + n).join(' '))) {
        usado = n;
        break;
      }
    }
    const seq = toks.slice(i, i + usado);
    const alternativas = alternativasDe(seq);
    const esUltimo = i + usado === toks.length;
    grupos.push({ original: seq, alternativas, prefijo: esUltimo && !terminaEnEspacio && usado === 1 });
    i += usado;
  }
  return grupos;
}
