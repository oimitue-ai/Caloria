/**
 * Pipeline completo del catálogo CALORÍA.
 *   cd datos && npm install && npm run construir            # incremental (salta fuentes sin cambios)
 *   npm run construir -- --forzar                           # rehace todo
 *   npm run construir -- --solo=base                        # no publica marcas
 * Etapas: importar (por fuente, en streaming) → validar → deduplicar → traducir/enriquecer → recetas → publicar.
 */
import { readFileSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { Alimento, FuenteId } from '../../src/tipos.ts';
import { localizarFuentes, nombresCurados, objetosFdc, registroOff, registroUsdaBranded, registroUsdaGenerico, filasOff, type ArchivoFuente, type Registro } from './importar.ts';
import { validar } from './validar.ts';
import { normalizar } from '../../src/catalogo/normalizar.ts';
import { traducirNombre, mexicanizar } from './traducir.ts';
import { esCodigoMexicano, esMarcaMexicana, esMexicanoPorTexto } from './mexicano.ts';
import { calcularRecetas } from './recetas.ts';
import { publicar } from './publicar.ts';
import { Contador, EscritorNdjson, INTERMEDIO, SALIDA, asegurarDir, escribirJson, existe, firmaArchivo, hashTexto, leerJson, leerNdjson, log } from './util.ts';

const args = process.argv.slice(2);
const FORZAR = args.includes('--forzar');
const SOLO = args.find((a) => a.startsWith('--solo='))?.split('=')[1];

/** Huella del código del pipeline: si cambia el glosario o las reglas, se reimporta. */
function huellaCodigo(): string {
  const dir = new URL('.', import.meta.url).pathname;
  const archivos = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort();
  const extra = [join(dir, '../../src/catalogo/normalizar.ts')];
  return hashTexto(archivos.map((f) => readFileSync(join(dir, f), 'utf8')).join('') + extra.map((f) => readFileSync(f, 'utf8')).join(''));
}

export interface EstadisticasFuente {
  fuente: FuenteId;
  archivo: string;
  version: string;
  procedencia: string;
  leidos: number;
  importados: number;
  descartados: Record<string, number>;
  atipicos: number;
  duplicados?: Record<string, number>;
  traduccion?: { traducidos: number; curados: number; cobertura100: number; coberturaMedia: number };
  mexicanos: number;
  segundos: number;
}

const curados = nombresCurados();

function enriquecerGenerico(a: Alimento, c: { traducidos: number; curados: number; cobertura100: number; sumaCob: number }) {
  const cur = a.fuente === 'usda_sr_legacy' ? curados.get(a.idOriginal) : undefined;
  if (cur) {
    // "Plátano (banana)" → tras mexicanizar quedaría "Plátano (plátano)": se quita el paréntesis redundante
    a.nombre = mexicanizar(cur.nombre).replace(/\s*\(([^)]+)\)/g, (m, x: string) => (a.nombre && normalizar(mexicanizar(cur.nombre).split('(')[0]).trim() === normalizar(x).trim() ? '' : m));
    if (normalizar(cur.nombre) !== normalizar(a.nombre)) (cur.alias = [...cur.alias, cur.nombre]);
    a.nombreTraducido = false;
    if (cur.alias.length) a.sinonimos = cur.alias.map(mexicanizar);
    c.curados++;
  } else {
    const t = traducirNombre(a.nombreOriginal);
    a.nombre = t.nombre;
    a.nombreTraducido = true;
    c.traducidos++;
    c.sumaCob += t.cobertura;
    if (t.cobertura === 1) c.cobertura100++;
  }
  if (a.categoria) a.categoria = traducirNombre(a.categoria).nombre;
  if (esMexicanoPorTexto(a.nombreOriginal)) a.mexicano = true;
}

async function importarFuente(f: ArchivoFuente, huella: string): Promise<EstadisticasFuente> {
  const salida = join(INTERMEDIO, `${f.fuente}.ndjson`);
  const sello = join(INTERMEDIO, `${f.fuente}.sello.json`);
  const firma = `${firmaArchivo(f.ruta)}|${huella}`;
  if (!FORZAR && existe(sello) && existe(salida)) {
    const s = leerJson(sello);
    if (s.firma === firma) {
      log(`${f.fuente}: sin cambios (incremental), se reutiliza`);
      return s.estadisticas;
    }
  }
  const t0 = Date.now();
  log(`${f.fuente}: importando ${f.procedencia}`);
  const tmp = salida + '.tmp';
  const out = new EscritorNdjson(tmp);
  const proc = new EscritorNdjson(join(SALIDA, 'procedencia', `${f.fuente}.ndjson`));
  const desc = new Contador();
  let leidos = 0;
  let atipicos = 0;
  let mexicanos = 0;
  const trad = { traducidos: 0, curados: 0, cobertura100: 0, sumaCob: 0 };
  const archivo = f.miembro ? `${f.ruta.split('/').pop()}:${f.miembro}` : f.ruta.split('/').pop()!;
  // Branded/OFF: deduplicación por GTIN (el más reciente) → se guarda el ganador por código
  const ganador = new Map<string, { id: string; fecha: string; n: number }>();
  let n = 0;
  const procesar = async (reg: Registro | null) => {
    leidos++;
    if (!reg) {
      desc.inc('no_es_alimento_final');
      return;
    }
    const v = validar(reg.a);
    if (!v.ok) {
      desc.inc(v.motivo!);
      return;
    }
    if (v.atipico) {
      reg.a.atipico = true;
      atipicos++;
    }
    if (f.fuente.startsWith('usda_') && f.fuente !== 'usda_branded') enriquecerGenerico(reg.a, trad);
    if (f.fuente === 'usda_branded' || f.fuente === 'off') {
      if (esCodigoMexicano(reg.a.codigoBarras) || esMarcaMexicana(reg.a.marca)) reg.a.mexicano = true;
      const cb = reg.a.codigoBarras;
      if (cb) {
        const fecha = reg.a.actualizado ?? '';
        const g = ganador.get(cb);
        if (!g || fecha > g.fecha || (fecha === g.fecha && Number(reg.a.idOriginal) > Number(g.id))) ganador.set(cb, { id: reg.a.id, fecha, n });
      }
    }
    if (reg.a.mexicano) mexicanos++;
    n++;
    await out.escribir(reg.a);
    await proc.escribir(reg.p);
  };
  if (f.fuente === 'off') {
    for await (const fila of filasOff(f)) await procesar(registroOff(fila, archivo));
  } else {
    for await (const food of objetosFdc(f)) {
      await procesar(f.fuente === 'usda_branded' ? registroUsdaBranded(food, archivo) : registroUsdaGenerico(food, f.fuente, archivo));
      if (leidos % 100000 === 0) log(`  ${f.fuente}: ${leidos} leídos`);
    }
  }
  await out.cerrar();
  await proc.cerrar();
  let importados = n;
  const duplicados: Record<string, number> = {};
  if (ganador.size) {
    // segunda pasada: quitar duplicados por GTIN conservando el más reciente
    const fin = new EscritorNdjson(salida + '.dedup');
    const ganadores = new Set([...ganador.values()].map((g) => g.id));
    let sinCodigo = 0;
    let dup = 0;
    mexicanos = 0;
    for await (const a of leerNdjson<Alimento>(tmp)) {
      if (a.codigoBarras && !ganadores.has(a.id)) {
        dup++;
        continue;
      }
      if (!a.codigoBarras) sinCodigo++;
      if (a.mexicano) mexicanos++;
      await fin.escribir(a);
    }
    await fin.cerrar();
    renameSync(salida + '.dedup', salida);
    duplicados.mismo_codigo_barras_se_conserva_el_mas_reciente = dup;
    duplicados.sin_codigo_barras_valido = sinCodigo;
    importados = n - dup;
  } else renameSync(tmp, salida);
  const est: EstadisticasFuente = {
    fuente: f.fuente,
    archivo,
    version: f.version,
    procedencia: f.procedencia,
    leidos,
    importados,
    descartados: desc.c,
    atipicos,
    duplicados: Object.keys(duplicados).length ? duplicados : undefined,
    traduccion: trad.traducidos + trad.curados ? { traducidos: trad.traducidos, curados: trad.curados, cobertura100: trad.cobertura100, coberturaMedia: Math.round((trad.sumaCob / Math.max(1, trad.traducidos)) * 1000) / 1000 } : undefined,
    mexicanos,
    segundos: Math.round((Date.now() - t0) / 1000),
  };
  escribirJson(sello, { firma, estadisticas: est }, true);
  log(`${f.fuente}: ${importados} importados de ${leidos} (${est.segundos}s)`, JSON.stringify(desc.c));
  return est;
}

async function main() {
  asegurarDir(INTERMEDIO);
  const huella = huellaCodigo();
  const fuentes = await localizarFuentes();
  log('fuentes:', Object.values(fuentes).map((f) => `${f!.fuente} ← ${f!.procedencia}`).join(' | '));
  const orden: FuenteId[] = ['usda_foundation', 'usda_sr_legacy', 'usda_fndds', 'off', 'usda_branded'];
  const estadisticas: EstadisticasFuente[] = [];
  for (const id of orden) {
    const f = fuentes[id];
    if (!f) continue;
    if (SOLO === 'base' && (id === 'usda_branded' || id === 'off')) {
      const sello = join(INTERMEDIO, `${id}.sello.json`);
      if (existe(sello)) estadisticas.push(leerJson(sello).estadisticas);
      continue;
    }
    estadisticas.push(await importarFuente(f, huella));
  }
  const recetas = await calcularRecetas();
  await publicar({ estadisticas, recetas, soloBase: SOLO === 'base' });
  log('listo');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
