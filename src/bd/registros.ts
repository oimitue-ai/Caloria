/**
 * Registros de comida. Cada registro guarda una INSTANTÁNEA del alimento: editar o borrar
 * después el alimento (propio, receta o de catálogo) no altera el historial.
 */
import type { Alimento, ComidaId, Metas, RegistroComida, UnidadId } from '../tipos';
import { calcularTotales, soloTotales } from '../nucleo/calculo';
import { estadisticasRango, resumirDia } from '../nucleo/estadisticas';
import type { EstadisticasRango, OpcionesEstadisticas, ResumenDia } from '../nucleo/estadisticas';
import { ahoraISO, esFechaValida, finMes, inicioMes } from '../nucleo/fechas';
import { instantaneaDe } from '../nucleo/instantanea';
import { metaVigenteEn } from '../nucleo/metas';
import { convertirABase } from '../nucleo/unidades';
import { obtenerAlimentoLocal } from './alimentos';
import { bd, nuevoId } from './esquema';
import type { Instantanea, UsoAlimento } from './tipos';
import { ErrorDatos } from './tipos';
import { esquemaRegistro, validar } from './validacion';

/** Alimento completo, o solo su instantánea con el id (p. ej. al repetir desde recientes/favoritos). */
export type AlimentoRegistrable = Alimento | (Instantanea & { id: string });

export interface NuevoRegistro {
  fecha: string;
  comida: ComidaId;
  alimento: AlimentoRegistrable;
  cantidad: number;
  unidad: UnidadId;
  porcionEtiqueta?: string;
}

export interface CambiosRegistro {
  cantidad?: number;
  unidad?: UnidadId;
  /** `null` la quita. Si cambia `unidad` y no se indica, se quita. */
  porcionEtiqueta?: string | null;
  fecha?: string;
  comida?: ComidaId;
}

const esAlimentoCompleto = (a: AlimentoRegistrable): a is Alimento => 'idOriginal' in a && 'validacion' in a;

/** Fuentes que no viven en el catálogo (no se guardan en la caché). */
const esLocal = (id: string) => id.startsWith('usuario:') || id.startsWith('receta:');

function revisarFecha(fecha: string): void {
  if (!esFechaValida(fecha)) throw new ErrorDatos(`Fecha inválida: "${fecha}".`, 'fecha');
}

/** Calcula cantidadBase y totales. Lanza `ErrorDatos` si la unidad no es convertible. */
function calcular(inst: Instantanea, cantidad: number, unidad: UnidadId, porcionEtiqueta?: string) {
  const conv = convertirABase(inst, cantidad, unidad, porcionEtiqueta);
  if (!conv.ok) throw new ErrorDatos(conv.motivo, 'unidad');
  return {
    cantidadBase: conv.cantidadBase,
    totales: soloTotales(calcularTotales(inst.nutrientes, conv.cantidadBase)),
    /** porción realmente usada (también cuando se resolvió sin etiqueta, p. ej. "2 piezas") */
    porcionEtiqueta: conv.porcion?.etiqueta ?? porcionEtiqueta,
  };
}

/** Crea el objeto registro sin guardarlo (útil para vista previa). */
export function prepararRegistro(datos: NuevoRegistro): RegistroComida {
  revisarFecha(datos.fecha);
  const inst = instantaneaDe(datos.alimento);
  const { cantidadBase, totales, porcionEtiqueta } = calcular(inst, datos.cantidad, datos.unidad, datos.porcionEtiqueta);
  const ahora = ahoraISO();
  const r: RegistroComida = {
    id: nuevoId(),
    fecha: datos.fecha,
    comida: datos.comida,
    alimentoId: datos.alimento.id,
    instantanea: inst,
    cantidad: datos.cantidad,
    unidad: datos.unidad,
    cantidadBase,
    totales,
    creado: ahora,
    modificado: ahora,
  };
  if (porcionEtiqueta !== undefined) r.porcionEtiqueta = porcionEtiqueta;
  return validar(esquemaRegistro, r, 'Registro');
}

async function anotarUso(r: RegistroComida): Promise<void> {
  const tabla = bd().usos;
  const previo = await tabla.get([r.alimentoId, r.comida]);
  const uso: UsoAlimento = {
    alimentoId: r.alimentoId,
    comida: r.comida,
    nombre: r.instantanea.nombre,
    instantanea: r.instantanea,
    cantidad: r.cantidad,
    unidad: r.unidad,
    usos: (previo?.usos ?? 0) + 1,
    ultimoUso: r.modificado,
  };
  if (r.instantanea.marca !== undefined) uso.marca = r.instantanea.marca;
  if (r.porcionEtiqueta !== undefined) uso.porcionEtiqueta = r.porcionEtiqueta;
  await tabla.put(uso);
}

/**
 * Registra un alimento en una comida. Recuerda la cantidad/unidad para "recientes" y, si es de
 * catálogo, guarda el alimento completo en la caché para usarlo sin conexión.
 */
export async function agregarRegistro(datos: NuevoRegistro): Promise<RegistroComida> {
  const r = prepararRegistro(datos);
  const b = bd();
  await b.transaction('rw', [b.registros, b.usos, b.cacheAlimentos], async () => {
    await b.registros.add(r);
    await anotarUso(r);
    if (esAlimentoCompleto(datos.alimento) && !esLocal(datos.alimento.id)) {
      await b.cacheAlimentos.put({ id: datos.alimento.id, alimento: datos.alimento, ultimoUso: r.creado });
    }
  });
  return r;
}

/** Registra varios alimentos de una vez (todo o nada). */
export async function agregarRegistros(lista: NuevoRegistro[]): Promise<RegistroComida[]> {
  const registros = lista.map(prepararRegistro);
  const b = bd();
  await b.transaction('rw', [b.registros, b.usos, b.cacheAlimentos], async () => {
    await b.registros.bulkAdd(registros);
    for (let i = 0; i < registros.length; i++) {
      await anotarUso(registros[i]);
      const a = lista[i].alimento;
      if (esAlimentoCompleto(a) && !esLocal(a.id)) {
        await b.cacheAlimentos.put({ id: a.id, alimento: a, ultimoUso: registros[i].creado });
      }
    }
  });
  return registros;
}

/**
 * Edita cantidad/unidad/porción/fecha/comida. Recalcula cantidadBase y totales con la
 * INSTANTÁNEA guardada (no con el alimento actual), así que el historial no cambia de valores.
 */
export async function editarRegistro(id: string, cambios: CambiosRegistro): Promise<RegistroComida> {
  const b = bd();
  return b.transaction('rw', [b.registros, b.usos], async () => {
    const actual = await b.registros.get(id);
    if (!actual) throw new ErrorDatos('El registro ya no existe.');
    const cantidad = cambios.cantidad ?? actual.cantidad;
    const unidad = cambios.unidad ?? actual.unidad;
    let porcion: string | undefined = actual.porcionEtiqueta;
    if (cambios.porcionEtiqueta !== undefined) porcion = cambios.porcionEtiqueta ?? undefined;
    else if (cambios.unidad !== undefined && cambios.unidad !== actual.unidad) porcion = undefined;
    if (cambios.fecha !== undefined) revisarFecha(cambios.fecha);

    const calc = calcular(actual.instantanea, cantidad, unidad, porcion);
    const { cantidadBase, totales } = calc;
    porcion = calc.porcionEtiqueta;
    const nuevo: RegistroComida = {
      ...actual,
      fecha: cambios.fecha ?? actual.fecha,
      comida: cambios.comida ?? actual.comida,
      cantidad,
      unidad,
      cantidadBase,
      totales,
      modificado: ahoraISO(),
    };
    delete nuevo.porcionEtiqueta;
    if (porcion !== undefined) nuevo.porcionEtiqueta = porcion;
    validar(esquemaRegistro, nuevo, 'Registro');
    await b.registros.put(nuevo);
    // recuerda la nueva cantidad como "última usada", sin contar un uso más
    const uso = await b.usos.get([nuevo.alimentoId, nuevo.comida]);
    if (uso) {
      const u: UsoAlimento = { ...uso, cantidad, unidad, ultimoUso: nuevo.modificado };
      delete u.porcionEtiqueta;
      if (porcion !== undefined) u.porcionEtiqueta = porcion;
      await b.usos.put(u);
    }
    return nuevo;
  });
}

/** Elimina un registro y lo devuelve (para "deshacer" con `restaurarRegistro`). */
export async function eliminarRegistro(id: string): Promise<RegistroComida | undefined> {
  const b = bd();
  return b.transaction('rw', b.registros, async () => {
    const r = await b.registros.get(id);
    if (r) await b.registros.delete(id);
    return r;
  });
}

/** Vuelve a guardar un registro eliminado tal cual (mismo id e instantánea). */
export async function restaurarRegistro(registro: RegistroComida): Promise<void> {
  await bd().registros.put(validar(esquemaRegistro, registro, 'Registro'));
}

/** Elimina todos los registros de una comida de un día. Devuelve los eliminados. */
export async function vaciarComida(fecha: string, comida: ComidaId): Promise<RegistroComida[]> {
  const b = bd();
  return b.transaction('rw', b.registros, async () => {
    const lista = await b.registros.where('[fecha+comida]').equals([fecha, comida]).toArray();
    await b.registros.bulkDelete(lista.map((r) => r.id));
    return lista;
  });
}

function copiar(r: RegistroComida, fecha: string, comida: ComidaId, ahora: string): RegistroComida {
  return {
    ...structuredClone(r), id: nuevoId(), fecha, comida, creado: ahora, modificado: ahora,
  };
}

/**
 * Copia los alimentos de una comida a otra fecha (y opcionalmente a otra comida).
 * Las copias conservan la instantánea, cantidades y totales del original.
 */
export async function copiarComida(
  fechaOrigen: string, comidaOrigen: ComidaId, fechaDestino: string, comidaDestino: ComidaId = comidaOrigen,
): Promise<RegistroComida[]> {
  revisarFecha(fechaDestino);
  const b = bd();
  return b.transaction('rw', [b.registros, b.usos], async () => {
    const origen = await b.registros.where('[fecha+comida]').equals([fechaOrigen, comidaOrigen]).sortBy('creado');
    const ahora = ahoraISO();
    const copias = origen.map((r) => copiar(r, fechaDestino, comidaDestino, ahora));
    await b.registros.bulkAdd(copias);
    for (const c of copias) await anotarUso(c);
    return copias;
  });
}

/** Copia todas las comidas de un día a otra fecha. */
export async function copiarDia(fechaOrigen: string, fechaDestino: string): Promise<RegistroComida[]> {
  revisarFecha(fechaDestino);
  const b = bd();
  return b.transaction('rw', [b.registros, b.usos], async () => {
    const origen = await b.registros.where('fecha').equals(fechaOrigen).sortBy('creado');
    const ahora = ahoraISO();
    const copias = origen.map((r) => copiar(r, fechaDestino, r.comida, ahora));
    await b.registros.bulkAdd(copias);
    for (const c of copias) await anotarUso(c);
    return copias;
  });
}

// ───────────── Consultas ─────────────

export async function obtenerRegistro(id: string): Promise<RegistroComida | undefined> {
  return bd().registros.get(id);
}

/** Registros de un día, en orden de captura. */
export async function registrosDelDia(fecha: string): Promise<RegistroComida[]> {
  return bd().registros.where('fecha').equals(fecha).sortBy('creado');
}

export async function registrosDeComida(fecha: string, comida: ComidaId): Promise<RegistroComida[]> {
  return bd().registros.where('[fecha+comida]').equals([fecha, comida]).sortBy('creado');
}

/** Registros con fecha en [desde, hasta] (ambas incluidas), ordenados por fecha. */
export async function registrosEnRango(desde: string, hasta: string): Promise<RegistroComida[]> {
  if (desde > hasta) return [];
  return bd().registros.where('fecha').between(desde, hasta, true, true).toArray();
}

/** Todos los registros de un alimento (por id), p. ej. para ver su historial. */
export async function registrosDeAlimento(alimentoId: string): Promise<RegistroComida[]> {
  return bd().registros.where('alimentoId').equals(alimentoId).toArray();
}

/** Fechas con al menos un registro en el mes ('YYYY-MM'), ordenadas. */
export async function diasConRegistro(mes: string): Promise<string[]> {
  const inicio = inicioMes(`${mes}-01`);
  const keys = await bd().registros.where('fecha').between(inicio, finMes(inicio), true, true).uniqueKeys();
  return (keys as string[]).sort();
}

async function historialMetas(): Promise<Metas[]> {
  return bd().metas.orderBy('desde').toArray();
}

/** Resumen del día: registros por comida, totales, meta vigente y restante. */
export async function resumenDelDia(fecha: string): Promise<ResumenDia> {
  const [registros, metas] = await Promise.all([registrosDelDia(fecha), historialMetas()]);
  return resumirDia(fecha, registros, metaVigenteEn(metas, fecha));
}

/** Estadísticas del rango (ver nucleo/estadisticas). */
export async function estadisticasDeRango(
  desde: string, hasta: string, opciones: OpcionesEstadisticas = {},
): Promise<EstadisticasRango> {
  const [registros, metas] = await Promise.all([registrosEnRango(desde, hasta), historialMetas()]);
  return estadisticasRango(registros, metas, desde, hasta, opciones);
}

/**
 * Registra de nuevo un alimento desde recientes/frecuentes/favoritos con su última cantidad.
 * Usa la versión ACTUAL del alimento si está en los datos locales (propio, receta o caché);
 * si no, la instantánea guardada.
 */
export async function repetirUso(
  uso: Pick<UsoAlimento, 'alimentoId' | 'instantanea' | 'cantidad' | 'unidad' | 'porcionEtiqueta'>,
  fecha: string, comida: ComidaId, cambios: { cantidad?: number; unidad?: UnidadId; porcionEtiqueta?: string } = {},
): Promise<RegistroComida> {
  const alimento = (await obtenerAlimentoLocal(uso.alimentoId)) ?? { ...uso.instantanea, id: uso.alimentoId };
  const datos: NuevoRegistro = {
    fecha, comida, alimento,
    cantidad: cambios.cantidad ?? uso.cantidad,
    unidad: cambios.unidad ?? uso.unidad,
  };
  const porcion = cambios.unidad !== undefined ? cambios.porcionEtiqueta : (cambios.porcionEtiqueta ?? uso.porcionEtiqueta);
  if (porcion !== undefined) datos.porcionEtiqueta = porcion;
  return agregarRegistro(datos);
}
