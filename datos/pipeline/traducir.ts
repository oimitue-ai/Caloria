/**
 * Traducción por reglas de nombres de alimentos USDA (inglés) al español de México.
 * No es traducción automática estadística: glosario cerrado + reglas de orden (núcleo, "de" + modificador,
 * adjetivos concordados). Las palabras desconocidas se conservan en inglés y se reportan.
 */
import { GLOSARIO, MEXICANIZAR } from './glosario.ts';

type Tipo = 'm' | 'f' | 'a' | 'i' | 'p' | 'x' | 'u' | 'n';
interface Entrada {
  es: string;
  tipo: Tipo;
  mod?: string;
}
interface Item extends Entrada {
  original: string;
}

const MAPA = new Map<string, Entrada>();
let MAX_PALABRAS = 1;
for (const linea of GLOSARIO.split('\n')) {
  const l = linea.trim();
  if (!l || l.startsWith('#')) continue;
  const i = l.indexOf(' = ');
  if (i < 0) continue;
  const en = l.slice(0, i).trim().toLowerCase();
  const [es, tipo, mod] = l
    .slice(i + 3)
    .split(';')
    .map((x) => x.trim());
  if (!MAPA.has(en)) MAPA.set(en, { es, tipo: (tipo || 'i') as Tipo, mod: mod || undefined });
  MAX_PALABRAS = Math.max(MAX_PALABRAS, en.split(' ').length);
}

export const TAMANO_GLOSARIO = MAPA.size;

function feminizar(s: string): string {
  const [p, ...resto] = s.split(' ');
  let f = p;
  if (/os$/.test(p)) f = p.slice(0, -2) + 'as';
  else if (/o$/.test(p)) f = p.slice(0, -1) + 'a';
  else if (/és$/.test(p)) f = p.slice(0, -2) + 'esa';
  else if (/[oó]n$/.test(p) && p.length > 4) f = p.replace(/ón$/, 'ona');
  return [f, ...resto].join(' ');
}

/** Divide un segmento en palabras conservando números, fracciones, %, guiones y apóstrofos. */
function palabras(seg: string): string[] {
  return seg.match(/\bw\/o?(?![A-Za-z])|[0-9]+(?:[./][0-9]+)?\s?%?"?|[A-Za-zÀ-ÿ]+(?:['’-][A-Za-zÀ-ÿ]+)*|\/|&|[^\sA-Za-z0-9,]/g) ?? [];
}

function buscarFrases(ws: string[]): Item[] {
  const items: Item[] = [];
  let i = 0;
  while (i < ws.length) {
    let encontrado: Item | null = null;
    for (let n = Math.min(MAX_PALABRAS, ws.length - i); n >= 1; n--) {
      const frase = ws
        .slice(i, i + n)
        .join(' ')
        .toLowerCase();
      const e = MAPA.get(frase) ?? (n === 1 ? MAPA.get(frase.replace(/'s$/, '')) : undefined);
      if (e) {
        encontrado = { ...e, original: ws.slice(i, i + n).join(' ') };
        i += n;
        break;
      }
    }
    if (!encontrado) {
      const w = ws[i];
      if (/^[0-9]/.test(w)) encontrado = { es: w, tipo: 'n', original: w };
      else if (w === '/' || w === '&') encontrado = { es: w === '&' ? 'y' : '/', tipo: 'p', original: w };
      else if (!/[A-Za-z]/.test(w)) encontrado = { es: w, tipo: 'i', original: w };
      else if (MARCAS.has(w.toLowerCase().replace(/[’']s$/, ''))) encontrado = { es: w, tipo: 'i', original: w };
      else encontrado = compuestoConGuion(w) ?? { es: w, tipo: 'u', original: w };
      i++;
    }
    items.push(encontrado);
  }
  return items;
}

/** Marcas y nombres propios frecuentes en SR/FNDDS: se conservan y no cuentan como desconocidos. */
const MARCAS = new Set(
  `quaker enfamil similac gerber abbott mcdonald kfc malt-o-meal silk post nestle vitasoy archway chobani kraft breyers
  wendy popeyes denny america snickers subway applebee domino isomil nasoya hormel nabisco hershey digiorno whopper
  campbell friday prosobee splash smart lipil gentlease nutramigen advance pillsbury kellogg kellog general mills
  oscar mayer martha white betty crocker jell-o mission dannon yoplait chef boyardee banquet stouffer lean cuisine
  healthy choice weight watchers kashi cheerios doritos fritos cheetos lay pringles tostitos ritz oreo m&m reese
  kit kat twix milky way musketeers starburst skittles twizzlers klondike eskimo sara lee pepperidge farm
  lance keebler sunshine heinz hunt del monte dole libby green giant birds eye ore-ida goya old el paso
  taco bell chipotle carrabba olive garden red lobster outback papa john hut little caesars burger king
  sonic arby jack box boston market chick-fil-a chick fil zone luna clif kind powerbar slimfast ensure boost
  pediasure gatorade powerade red bull monster rockstar coca-cola coca cola pepsi sprite fanta dr pepper
  mountain dew 7up 7-up sunkist minute maid tropicana snapple lipton arizona v8 ovaltine nesquik carnation
  silk soy dream rice dream blue diamond so delicious alpro tofutti morningstar boca gardenburger amy
  alimentum pregestimil neosure enfacare enfagrow nutren peptamen glucerna nepro carbstart eas muscle milk
  mars hershey's cadbury lindt ghirardelli nature valley quaker's kraft's mcdonalds mcdonald's popeye's
  goldfish cap'n crunch lucky charms trix wheaties chex fiber one special k froot loops apple jacks
  corn pops raisin bran honey nut frosted mini-wheats rice krispies cocoa puffs golden grahams life
  toaster strudel eggo pop-tarts poptarts hostess twinkie ding dongs little debbie entenmann
  spam vienna underwood libby's bumble bee starkist chicken of the sea van camp bush`.split(/\s+/).filter(Boolean),
);

/** Palabras compuestas con guion: "tomato-based" → "a base de jitomate", "sugar-free" → "sin azúcar". */
function compuestoConGuion(w: string): Item | null {
  if (!w.includes('-')) return null;
  const lw = w.toLowerCase();
  const tr = (x: string) => {
    const e = MAPA.get(x);
    return e ? (e.mod ?? e.es) : null;
  };
  const sufijos: [RegExp, (x: string) => string][] = [
    [/^(.+)-based$/, (x) => `a base de ${x}`],
    [/^(.+)-flavou?red$/, (x) => `sabor ${x}`],
    [/^(.+)-filled$/, (x) => `relleno de ${x}`],
    [/^(.+)-free$/, (x) => `sin ${x}`],
    [/^(.+)-style$/, (x) => `estilo ${x}`],
    [/^(.+)-type$/, (x) => `tipo ${x}`],
    [/^(.+)-coated$/, (x) => `cubierto de ${x}`],
    [/^(.+)-topped$/, (x) => `con ${x} encima`],
    [/^(.+)-like$/, (x) => `tipo ${x}`],
    [/^(.+)-fed$/, (x) => `alimentado con ${x}`],
  ];
  for (const [re, f] of sufijos) {
    const m = re.exec(lw);
    if (m) {
      const base = tr(m[1]);
      if (base) return { es: f(base), tipo: 'i', original: w };
    }
  }
  const pre = /^(pre|non|un|semi|multi|low|high|extra)-(.+)$/.exec(lw);
  if (pre) {
    const base = MAPA.get(pre[2]);
    const p = { pre: 'pre', non: 'no', un: 'sin', semi: 'semi', multi: 'multi', low: 'bajo en', high: 'alto en', extra: 'extra' }[pre[1]]!;
    if (base) return { es: `${p} ${base.mod ?? base.es}`.replace('pre ', 'pre').replace('semi ', 'semi').replace('multi ', 'multi'), tipo: base.tipo === 'a' ? 'a' : 'i', original: w };
  }
  const partes = lw.split('-');
  const tr2 = partes.map((x) => MAPA.get(x));
  if (tr2.every(Boolean)) return { es: tr2.map((e) => e!.es).join(' '), tipo: 'i', original: w };
  return null;
}

/** Compone un fragmento sin preposiciones: núcleo + "de" modificadores + adjetivos + invariables. */
function componer(items: Item[], generoContexto: 'm' | 'f' | null): { texto: string; genero: 'm' | 'f' | null } {
  const sust = items.filter((x) => x.tipo === 'm' || x.tipo === 'f');
  const nucleo = sust.length ? sust[sust.length - 1] : null;
  const genero = nucleo ? (nucleo.tipo as 'm' | 'f') : generoContexto;
  const partes: string[] = [];
  if (nucleo) partes.push(nucleo.es);
  const mods = sust.slice(0, -1).reverse();
  for (const m of mods) partes.push('de ' + (m.mod ?? m.es));
  const despues: string[] = [];
  for (const it of items) {
    if (it === nucleo || mods.includes(it)) continue;
    if (it.tipo === 'x') continue;
    if (it.tipo === 'a') despues.push(genero === 'f' ? feminizar(it.es) : it.es);
    else despues.push(it.es);
  }
  // un número delante del núcleo ("2 tacos") se queda delante
  if (items[0]?.tipo === 'n' && nucleo) {
    const n = despues.shift()!;
    return { texto: [n, ...partes, ...despues].join(' '), genero };
  }
  return { texto: [...partes, ...despues].join(' '), genero };
}

export interface Traduccion {
  nombre: string;
  /** fracción de palabras con contenido que se tradujeron (0..1) */
  cobertura: number;
  desconocidas: string[];
}

function traducirSegmento(seg: string, generoCtx: 'm' | 'f' | null) {
  const items = buscarFrases(palabras(seg));
  const conocidas = items.filter((x) => x.tipo !== 'u' && x.tipo !== 'n' && x.tipo !== 'x' && /[a-z]/i.test(x.original)).length;
  const desconocidas = items.filter((x) => x.tipo === 'u').map((x) => x.original);
  // separar por palabras funcionales (con, sin, y, de…)
  const trozos: string[] = [];
  let actual: Item[] = [];
  let genero = generoCtx;
  let primerGenero: 'm' | 'f' | null = null;
  const vaciar = () => {
    if (!actual.length) return;
    const c = componer(actual, genero);
    trozos.push(c.texto);
    if (c.genero && !primerGenero) primerGenero = c.genero;
    // los adjetivos tras "y"/"o" siguen concordando con el núcleo anterior
    genero = primerGenero ?? genero;
    actual = [];
  };
  for (const it of items) {
    if (it.tipo === 'p') {
      vaciar();
      trozos.push(it.es);
    } else actual.push(it);
  }
  vaciar();
  const texto = trozos
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/ \/ /g, '/')
    .trim();
  return { texto, conocidas, desconocidas, genero: primerGenero as 'm' | 'f' | null };
}

export function traducirNombre(desc: string): Traduccion {
  let generoCtx: 'm' | 'f' | null = null;
  let conocidas = 0;
  const desconocidas: string[] = [];
  // paréntesis: se traducen aparte
  const partes: string[] = [];
  const sinParentesis = desc.replace(/\(([^)]*)\)/g, (_m, dentro: string) => {
    const t = traducirSegmento(dentro, null);
    conocidas += t.conocidas;
    desconocidas.push(...t.desconocidas);
    return `(${t.texto})`;
  });
  for (const seg of sinParentesis.split(/,\s*|;\s*|:\s*/)) {
    if (!seg.trim()) continue;
    if (/^\(.*\)$/.test(seg.trim())) {
      partes.push(seg.trim());
      continue;
    }
    // proteger paréntesis ya traducidos dentro del segmento
    const protegido: string[] = [];
    const s2 = seg.replace(/\([^)]*\)/g, (m) => {
      protegido.push(m);
      return ` ZZPAREN${String.fromCharCode(97 + protegido.length - 1)}ZZ `;
    });
    const t = traducirSegmento(s2, generoCtx);
    conocidas += t.conocidas;
    desconocidas.push(...t.desconocidas.filter((d) => !/^ZZPAREN[a-z]ZZ$/.test(d)));
    if (!generoCtx && t.genero) generoCtx = t.genero;
    partes.push(t.texto.replace(/ZZPAREN([a-z])ZZ/g, (_m, k: string) => protegido[k.charCodeAt(0) - 97]));
  }
  let nombre = partes.join(', ').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
  nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);
  const total = conocidas + desconocidas.length;
  return { nombre, cobertura: total ? conocidas / total : 1, desconocidas };
}

/** Ajustes de vocabulario de México para nombres en español de otras fuentes. */
export function mexicanizar(nombre: string): string {
  let s = nombre;
  for (const [re, rep] of MEXICANIZAR) s = s.replace(re, (m) => (m[0] === m[0].toUpperCase() ? rep.charAt(0).toUpperCase() + rep.slice(1) : rep));
  return s;
}

/** Traduce el texto de una porción USDA ("1 cup, chopped", "1 large") al español. */
export function traducirPorcion(texto: string): string {
  if (!texto) return texto;
  const t = traducirNombre(texto.replace(/\bfl oz\b/gi, 'floz'));
  return t.nombre
    .replace(/\bfloz\b/gi, 'onza líquida')
    .replace(/^(\d+(?:[./]\d+)?) (.*)$/, '$1 $2')
    .replace(/^./, (c) => c.toLowerCase());
}
