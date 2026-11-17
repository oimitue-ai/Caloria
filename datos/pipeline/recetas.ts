/**
 * Platillos mexicanos por receta estandarizada (fuente 'caloria_recetas', validación 'receta_estandar').
 * Lee datos/recetas_mx.json; cada ingrediente es un id de un registro oficial ya importado (o de otra receta).
 * Valores por 100 g del platillo = Σ(nutriente_i × g_i / 100) / (Σ g_i × factorCoccion) × 100.
 * Un nutriente queda como faltante si falta en algún ingrediente que pese > 3 % de la receta; en ingredientes
 * menores (sal, especias) un faltante se cuenta como 0 y se anota en la procedencia.
 */
import { join } from 'node:path';
import type { Alimento, Nutrientes, Porcion, UnidadId } from '../../src/tipos.ts';
import { EscritorNdjson, INTERMEDIO, RAIZ_DATOS, SALIDA, leerJson, leerNdjson, log, r } from './util.ts';

interface IngredienteJson {
  id: string;
  g?: number;
  ml?: number;
  nota?: string;
}
interface RecetaJson {
  id: string;
  nombre: string;
  sinonimos?: string[];
  categoria?: string;
  ingredientes: IngredienteJson[];
  factorCoccion: { valor: number; nota: string };
  porciones: { etiqueta: string; unidad: UnidadId; g?: number; total?: boolean; multiplo?: number }[];
}

const CLAVES = ['kcal', 'proteina', 'carbohidratos', 'grasa', 'grasaSaturada', 'fibra', 'azucares', 'sodio'] as const;

export interface ResultadoRecetas {
  registros: Alimento[];
  estadisticas: { recetas: number; ingredientesOficiales: number; errores: string[] };
}

export async function calcularRecetas(): Promise<ResultadoRecetas> {
  const archivo = leerJson<{ nota: string; recetas: RecetaJson[] }>(join(RAIZ_DATOS, 'recetas_mx.json'));
  const necesarios = new Set(archivo.recetas.flatMap((x) => x.ingredientes.map((i) => i.id)));
  const oficiales = new Map<string, Alimento>();
  for (const f of ['usda_sr_legacy', 'usda_fndds', 'usda_foundation']) {
    try {
      for await (const a of leerNdjson<Alimento>(join(INTERMEDIO, `${f}.ndjson`))) if (necesarios.has(a.id)) oficiales.set(a.id, a);
    } catch {
      /* fuente ausente */
    }
  }
  const hechas = new Map<string, Alimento>();
  const errores: string[] = [];
  const proc = new EscritorNdjson(join(SALIDA, 'procedencia', 'caloria_recetas.ndjson'));
  const pendientes = [...archivo.recetas];
  let vueltas = 0;
  while (pendientes.length && vueltas++ < 10) {
    for (let k = pendientes.length - 1; k >= 0; k--) {
      const rec = pendientes[k];
      const ings = rec.ingredientes.map((i) => ({ i, a: oficiales.get(i.id) ?? hechas.get(i.id) }));
      if (ings.some((x) => !x.a && x.i.id.startsWith('caloria_recetas:') && pendientes.some((p) => `caloria_recetas:${p.id}` === x.i.id))) continue;
      pendientes.splice(k, 1);
      const faltan = ings.filter((x) => !x.a).map((x) => x.i.id);
      if (faltan.length) {
        errores.push(`${rec.id}: ingredientes no encontrados ${faltan.join(', ')}`);
        continue;
      }
      // gramos de cada ingrediente (ml → g con la densidad de la fuente oficial)
      const conG: { i: IngredienteJson; a: Alimento; g: number }[] = [];
      let error = '';
      for (const { i, a } of ings) {
        let g = i.g;
        if (g === undefined && i.ml !== undefined) {
          if (a!.base === 'ml') g = i.ml; // la base del ingrediente ya es ml
          else if (a!.densidad) g = i.ml * a!.densidad;
          else error = `${rec.id}: ${i.id} en ml sin densidad conocida`;
        }
        conG.push({ i, a: a!, g: g ?? 0 });
      }
      if (error) {
        errores.push(error);
        continue;
      }
      const pesoCrudo = conG.reduce((s, x) => s + x.g, 0);
      const pesoFinal = pesoCrudo * rec.factorCoccion.valor;
      const n: Nutrientes = {};
      const micros: Record<string, number> = {};
      const supuestosCero: string[] = [];
      const sumar = (clave: string, obtener: (a: Alimento) => number | undefined, destino: Record<string, number>) => {
        let s = 0;
        for (const x of conG) {
          const v = obtener(x.a);
          if (v === undefined) {
            if (x.g / pesoCrudo > 0.03) return;
            supuestosCero.push(`${clave}@${x.i.id}`);
            continue;
          }
          s += (v * x.g) / 100;
        }
        destino[clave] = r((s / pesoFinal) * 100, clave === 'kcal' || clave === 'sodio' ? 1 : 2)!;
      };
      for (const c of CLAVES) sumar(c, (a) => a.nutrientes[c], n as Record<string, number>);
      const clavesMicro = new Set(conG.flatMap((x) => Object.keys(x.a.nutrientes.micros ?? {})));
      for (const c of clavesMicro) sumar(c, (a) => a.nutrientes.micros?.[c], micros);
      if (Object.keys(micros).length) n.micros = micros;
      const porciones: Porcion[] = rec.porciones.map((p, idx) => {
        const eq = p.total ? pesoFinal : p.multiplo ? pesoFinal * p.multiplo : p.g!;
        const etiqueta = /\(\s*\d/.test(p.etiqueta) ? p.etiqueta : `${p.etiqueta} (${Math.round(eq)} g)`;
        return { etiqueta, unidad: p.unidad, equivalencia: r(eq, 1)!, ...(idx === 0 ? { predeterminada: true } : {}) };
      });
      const lista = conG.map((x) => `${x.a.nombre} ${Math.round(x.g * 10) / 10} g`).join('; ');
      const a: Alimento = {
        id: `caloria_recetas:${rec.id}`,
        fuente: 'caloria_recetas',
        idOriginal: rec.id,
        nombre: rec.nombre,
        nombreOriginal: rec.nombre,
        idiomaOriginal: 'es',
        sinonimos: rec.sinonimos,
        categoria: rec.categoria,
        base: 'g',
        nutrientes: n,
        porciones,
        actualizado: new Date().toISOString().slice(0, 10),
        validacion: 'receta_estandar',
        mexicano: true,
        notas: `${archivo.nota}. Ingredientes (receta típica): ${lista}. Factor de cocción ${rec.factorCoccion.valor} (${rec.factorCoccion.nota}).`,
      };
      hechas.set(a.id, a);
      await proc.escribir({
        id: a.id,
        archivo: 'datos/recetas_mx.json',
        pesoCrudoG: r(pesoCrudo, 1),
        pesoFinalG: r(pesoFinal, 1),
        factorCoccion: rec.factorCoccion,
        ingredientes: conG.map((x) => ({ id: x.i.id, nombre: x.a.nombreOriginal, g: r(x.g, 1), ml: x.i.ml, nota: x.i.nota })),
        faltantesContadosComoCero: supuestosCero,
      });
    }
  }
  for (const p of pendientes) errores.push(`${p.id}: dependencia circular`);
  await proc.cerrar();
  const out = new EscritorNdjson(join(INTERMEDIO, 'caloria_recetas.ndjson'));
  for (const a of hechas.values()) await out.escribir(a);
  await out.cerrar();
  if (errores.length) log('recetas con errores:', errores);
  log(`recetas: ${hechas.size} calculadas de ${archivo.recetas.length}`);
  return { registros: [...hechas.values()], estadisticas: { recetas: hechas.size, ingredientesOficiales: oficiales.size, errores } };
}
