/**
 * Normalización de texto compartida por el pipeline (datos/) y el buscador cliente.
 * Cambiar algo aquí obliga a reconstruir el catálogo (los índices guardan términos normalizados).
 */

/** Minúsculas, sin acentos/diacríticos (ñ→n), solo [a-z0-9] separados por un espacio. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Palabras vacías (español e inglés) que no se indexan ni se exigen en la consulta. */
export const PALABRAS_VACIAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'o', 'u', 'a', 'al', 'en', 'con', 'por', 'para', 'un', 'una',
  'unos', 'unas', 'lo', 'su', 'sus',
  'of', 'the', 'and', 'or', 'with', 'in', 'on', 'for', 'to', 'an', 'by', 'from', 'as', 'at', 'w',
]);

/**
 * Raíz ligera (quita plurales en español/inglés). No es lingüísticamente perfecta: basta con
 * que sea la MISMA en el índice y en la consulta.
 */
export function raiz(t: string): string {
  if (t.length <= 3 || /^\d/.test(t)) return t;
  if (t.endsWith('ces') && t.length > 4) t = t.slice(0, -3) + 'z'; // nueces→nuez
  else if (t.endsWith('ies') && t.length > 4) t = t.slice(0, -3) + 'y'; // berries→berry
  else if (t.endsWith('oes') && t.length > 4) t = t.slice(0, -2); // tomatoes→tomato
  else if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) t = t.slice(0, -1);
  // frijoles→frijole→frijol = frijol; chiles→chile→chil = chile→chil (misma raíz en singular y plural)
  if (t.length >= 4 && t.endsWith('e') && 'lrndj'.includes(t[t.length - 2])) t = t.slice(0, -1);
  return t;
}

/** Clave fonética simple del español (z/s/c, v/b, ll/y, h muda, qu/k) para tolerar errores comunes. */
export function fonetica(t: string): string {
  return t
    .replace(/qu([ei])/g, 'k$1')
    .replace(/c([ei])/g, 's$1')
    .replace(/z/g, 's')
    .replace(/k/g, 'c')
    .replace(/v/g, 'b')
    .replace(/ll/g, 'y')
    .replace(/h/g, '')
    .replace(/(.)\1+/g, '$1');
}

/** Tokens normalizados (sin vacías, con raíz). Los números se conservan. */
export function tokenizar(texto: string): string[] {
  const n = normalizar(texto);
  if (!n) return [];
  const salida: string[] = [];
  for (const p of n.split(' ')) {
    if (!p || PALABRAS_VACIAS.has(p)) continue;
    salida.push(raiz(p));
  }
  return salida;
}

/** Tokens únicos preservando el orden de aparición. */
export function tokensUnicos(texto: string): string[] {
  return [...new Set(tokenizar(texto))];
}

/** Distancia de edición (Damerau restringida) acotada: devuelve >max si se pasa. */
export function distanciaEdicion(a: string, b: string, max: number): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (a === b) return 0;
  let prev2: number[] = new Array(lb + 1).fill(0);
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  let cur: number[] = new Array(lb + 1).fill(0);
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let minFila = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cb = b.charCodeAt(j - 1);
      const costo = ca === cb ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
      if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < minFila) minFila = v;
    }
    if (minFila > max) return max + 1;
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return prev[lb];
}

/** Trigramas con relleno (para similitud aproximada). */
export function trigramas(t: string): string[] {
  const s = `  ${t} `;
  const r: string[] = [];
  for (let i = 0; i < s.length - 2; i++) r.push(s.slice(i, i + 3));
  return r;
}

/** Normaliza un código de barras a GTIN-13 (UPC-A/EAN-8/UPC-E/GTIN-14). null si no es válido. */
export function normalizarCodigoBarras(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  let d = String(codigo).replace(/\D/g, '');
  if (!d) return null;
  const valido13 = (x: string) => {
    if (x.length !== 13) return false;
    let s = 0;
    for (let i = 0; i < 12; i++) s += Number(x[i]) * (i % 2 ? 3 : 1);
    return (10 - (s % 10)) % 10 === Number(x[12]);
  };
  if (d.length === 8 && !valido13(d.padStart(13, '0'))) d = expandirUpcE(d);
  if (d.length === 14 && d[0] === '0') d = d.slice(1);
  if (d.length < 13) d = d.padStart(13, '0');
  if (/^0+$/.test(d)) return null;
  return valido13(d) ? d : null;
}

function expandirUpcE(d: string): string {
  const n = d[0];
  const [a, b, c, dd, e, f] = d.slice(1, 7).split('');
  const ch = d[7];
  let cuerpo: string;
  if ('012'.includes(f)) cuerpo = `${a}${b}${f}0000${c}${dd}${e}`;
  else if (f === '3') cuerpo = `${a}${b}${c}00000${dd}${e}`;
  else if (f === '4') cuerpo = `${a}${b}${c}${dd}00000${e}`;
  else cuerpo = `${a}${b}${c}${dd}${e}0000${f}`;
  return n + cuerpo + ch;
}

/** Hash FNV-1a de 32 bits (para repartir ids en fragmentos de detalle). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
