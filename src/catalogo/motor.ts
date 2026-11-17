/**
 * Motor de búsqueda en memoria del catálogo base. Puro (sin DOM): corre en el Web Worker o en el hilo
 * principal (pruebas / navegadores sin Worker).
 */
import type { EstadoValidacion, FuenteId, Porcion, ResultadoBusqueda, UnidadId } from '../tipos.ts';
import { fonetica, normalizar, raiz, tokenizar } from './normalizar.ts';
import { analizarConsulta, type GrupoConsulta } from './consulta.ts';
import { resolverToken, type Vocabulario } from './terminos.ts';

/** Fila compacta publicada en base/indice-*.json (ver datos/pipeline/publicar.ts). */
export type FilaBase = [
  string, string, string, string, string, string, FuenteId, EstadoValidacion, 'g' | 'ml',
  number | null, number | null, number | null, number | null, [string, UnidadId, number] | 0, 0 | 1, number, 0 | 1,
];

const PESO_CAMPO = { nombre: 1, sinonimo: 0.92, original: 0.85, marca: 0.9 } as const;

interface Doc {
  fila: FilaBase;
  nTokensNombre: number;
  primerToken: string;
  tokensMarca: Set<string>;
}

/**
 * Descriptores de preparación "básica" que no cuentan como palabras extra del nombre al premiar nombres cortos
 * (auditoría: "huevo" dejaba "Huevo entero, crudo" en el lugar 11 y "arroz" a "Arroz blanco, cocido" en el 12).
 */
const NEUTROS = new Set(['crudo', 'cruda', 'cocido', 'cocida', 'entero', 'entera', 'natural', 'blanco', 'fresco', 'fresca', 'hervido', 'hervida']);

const BONO_FUENTE: Partial<Record<FuenteId, number>> = {
  caloria_recetas: 0.22,
  usda_sr_legacy: 0.12,
  usda_foundation: 0.12,
  usda_fndds: 0.08,
  usda_branded: -0.1,
  off: -0.12,
};

export class MotorBase {
  docs: Doc[] = [];
  /** término → (doc → peso de campo) */
  private post = new Map<string, Map<number, number>>();
  private vocabOrdenado: string[] = [];
  private porLargo = new Map<number, string[]>();
  private fon = new Map<string, string[]>();
  porId = new Map<string, number>();

  constructor(filas: FilaBase[]) {
    for (const f of filas) this.agregar(f);
    this.vocabOrdenado = [...this.post.keys()].sort();
    for (const t of this.vocabOrdenado) {
      const l = this.porLargo.get(t.length) ?? [];
      l.push(t);
      this.porLargo.set(t.length, l);
      const k = fonetica(t);
      const fl = this.fon.get(k) ?? [];
      fl.push(t);
      this.fon.set(k, fl);
    }
  }

  get tamano() {
    return this.docs.length;
  }

  private agregar(f: FilaBase) {
    const i = this.docs.length;
    const tn = tokenizar(f[1]);
    const marca = new Set(tokenizar(f[5]));
    this.docs.push({ fila: f, nTokensNombre: Math.max(1, tn.filter((t) => !NEUTROS.has(t)).length), primerToken: tn[0] ?? '', tokensMarca: marca });
    this.porId.set(f[0], i);
    const poner = (toks: string[], peso: number) => {
      for (const t of toks) {
        let m = this.post.get(t);
        if (!m) this.post.set(t, (m = new Map()));
        if ((m.get(i) ?? 0) < peso) m.set(i, peso);
      }
    };
    poner(tn, PESO_CAMPO.nombre);
    if (f[3]) poner(tokenizar(f[3].replace(/\|/g, ' ')), PESO_CAMPO.sinonimo);
    if (f[2]) poner(tokenizar(f[2]), PESO_CAMPO.original);
    if (f[5]) poner([...marca], PESO_CAMPO.marca);
  }

  private vocab: Vocabulario = {
    df: (t) => this.post.get(t)?.size ?? 0,
    conPrefijo: (p, max) => {
      const v = this.vocabOrdenado;
      let lo = 0;
      let hi = v.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (v[m] < p) lo = m + 1;
        else hi = m;
      }
      const out: string[] = [];
      for (let k = lo; k < v.length && v[k].startsWith(p); k++) out.push(v[k]);
      return out.sort((a, b) => (this.post.get(b)!.size - this.post.get(a)!.size) || a.length - b.length).slice(0, max);
    },
    candidatos: (t) => {
      const out: string[] = [];
      for (let d = -2; d <= 2; d++) out.push(...(this.porLargo.get(t.length + d) ?? []));
      return out;
    },
    porFonetica: (k) => this.fon.get(k),
  };

  /** doc → mejor peso del grupo (alternativas sinónimas × resolución difusa × campo). */
  private evaluarGrupo(g: GrupoConsulta, terminos: Set<string>): Map<number, { peso: number; enMarca: boolean }> {
    const res = new Map<number, { peso: number; enMarca: boolean }>();
    for (const alt of g.alternativas) {
      let acumulado: Map<number, { peso: number; enMarca: boolean }> | null = null;
      alt.tokens.forEach((tok, idxTok) => {
        const esPrefijo = g.prefijo && idxTok === alt.tokens.length - 1 && alt.peso === 1;
        const resueltos = resolverToken(tok, this.vocab, esPrefijo);
        const m = new Map<number, { peso: number; enMarca: boolean }>();
        for (const r of resueltos) {
          const p = this.post.get(r.termino);
          if (!p) continue;
          if (idxTok === 0) terminos.add(r.termino);
          for (const [doc, pc] of p) {
            const v = r.peso * pc;
            const prev = m.get(doc);
            const enMarca = pc === PESO_CAMPO.marca && this.docs[doc].tokensMarca.has(r.termino);
            if (!prev || prev.peso < v) m.set(doc, { peso: v, enMarca });
          }
        }
        if (!acumulado) acumulado = m;
        else {
          const nuevo = new Map<number, { peso: number; enMarca: boolean }>();
          for (const [doc, v] of acumulado) {
            const w = m.get(doc);
            if (w) nuevo.set(doc, { peso: Math.min(v.peso, w.peso), enMarca: v.enMarca || w.enMarca });
          }
          acumulado = nuevo;
        }
      });
      if (!acumulado) continue;
      for (const [doc, v] of acumulado as Map<number, { peso: number; enMarca: boolean }>) {
        const p = v.peso * alt.peso;
        const prev = res.get(doc);
        if (!prev || prev.peso < p) res.set(doc, { peso: p, enMarca: v.enMarca });
      }
    }
    return res;
  }

  buscar(texto: string, limite = 25, pagina = 0): { resultados: ResultadoBusqueda[]; total: number } {
    const grupos = analizarConsulta(texto);
    if (!grupos.length) return { resultados: [], total: 0 };
    const terminos = grupos.map(() => new Set<string>());
    const evals = grupos.map((g, i) => this.evaluarGrupo(g, terminos[i]));
    const puntos = new Map<number, number>();
    // AND estricto; si nada coincide, se acepta coincidencia parcial (al menos la mitad de los grupos)
    const minimo = (estricto: boolean) => (estricto ? grupos.length : Math.max(1, Math.ceil(grupos.length / 2)));
    for (const estricto of [true, false]) {
      const cuenta = new Map<number, { suma: number; n: number; marca: boolean }>();
      evals.forEach((ev) => {
        for (const [doc, v] of ev) {
          const c = cuenta.get(doc) ?? { suma: 0, n: 0, marca: false };
          c.suma += v.peso;
          c.n++;
          c.marca ||= v.enMarca;
          cuenta.set(doc, c);
        }
      });
      const min = minimo(estricto);
      for (const [doc, c] of cuenta) {
        if (c.n < min) continue;
        puntos.set(doc, this.puntuar(doc, c.suma / grupos.length, c.n, grupos, c.marca, terminos[0]));
      }
      if (puntos.size || grupos.length === 1) break;
    }
    const orden = [...puntos].sort((a, b) => b[1] - a[1] || this.docs[a[0]].fila[1].length - this.docs[b[0]].fila[1].length);
    const desde = pagina * limite;
    return { resultados: orden.slice(desde, desde + limite).map(([d, p]) => this.resultado(d, p)), total: orden.length };
  }

  private puntuar(doc: number, coincidencia: number, nGrupos: number, grupos: GrupoConsulta[], enMarca: boolean, terminos0: Set<string>): number {
    const d = this.docs[doc];
    const f = d.fila;
    let p = coincidencia * 2;
    if (nGrupos < grupos.length) p -= 0.6 * (grupos.length - nGrupos);
    // nombres cortos mejor puntuados
    const extra = Math.max(0, d.nTokensNombre - grupos.length);
    p += 0.6 / (1 + extra * 0.35);
    // el nombre empieza con lo buscado
    const primero = terminos0.has(d.primerToken);
    if (primero) p += 0.35;
    p += BONO_FUENTE[f[6]] ?? 0;
    if (f[14]) p += 0.15;
    if (f[16]) p -= 0.15;
    if (enMarca) p += 1;
    if (f[9] === null) p -= 0.3;
    return Math.round(p * 1000) / 1000;
  }

  private resultado(doc: number, puntuacion: number): ResultadoBusqueda {
    const f = this.docs[doc].fila;
    const porcion: Porcion | undefined = f[13] ? { etiqueta: f[13][0], unidad: f[13][1], equivalencia: f[13][2], predeterminada: true } : undefined;
    return {
      id: f[0],
      nombre: f[1],
      nombreOriginal: f[2] || undefined,
      marca: f[5] || undefined,
      categoria: f[4] || undefined,
      fuente: f[6],
      validacion: f[7],
      base: f[8],
      kcal: f[9] ?? undefined,
      proteina: f[10] ?? undefined,
      carbohidratos: f[11] ?? undefined,
      grasa: f[12] ?? undefined,
      porcionSugerida: porcion,
      mexicano: f[14] === 1 || undefined,
      puntuacion,
    };
  }

  /** índice del fragmento de detalle donde vive el id */
  fragmentoDetalle(id: string): number | undefined {
    const i = this.porId.get(id);
    return i === undefined ? undefined : this.docs[i].fila[15];
  }
}

export { normalizar, raiz };
