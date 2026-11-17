/** Registro de peso (una medición por fecha). Mantiene `perfil.pesoActualKg` al día. */
import type { RegistroPeso } from '../tipos';
import { esFechaValida, hoy } from '../nucleo/fechas';
import { bd, CLAVE_UNICA, nuevoId } from './esquema';
import { ErrorDatos } from './tipos';
import { esquemaPeso, validar } from './validacion';

/**
 * Sincroniza el perfil: `pesoActualKg` = último registro; `pesoInicialKg` = primero, solo si
 * el usuario no lo había capturado.
 */
export async function sincronizarPerfilConPesos(): Promise<void> {
  const b = bd();
  const perfil = (await b.perfil.get(CLAVE_UNICA)) ?? {};
  const ultimo = await b.pesos.orderBy('fecha').last();
  const primero = await b.pesos.orderBy('fecha').first();
  const nuevo = { ...perfil };
  if (ultimo) nuevo.pesoActualKg = ultimo.pesoKg;
  if (primero && nuevo.pesoInicialKg === undefined) nuevo.pesoInicialKg = primero.pesoKg;
  if (nuevo.pesoActualKg !== perfil.pesoActualKg || nuevo.pesoInicialKg !== perfil.pesoInicialKg) {
    await b.perfil.put(nuevo, CLAVE_UNICA);
  }
}

/** Registra el peso de una fecha (por defecto hoy). Si ya había uno ese día, lo reemplaza. */
export async function registrarPeso(datos: { pesoKg: number; fecha?: string; nota?: string }): Promise<RegistroPeso> {
  const b = bd();
  const fecha = datos.fecha ?? hoy();
  return b.transaction('rw', [b.pesos, b.perfil], async () => {
    const existente = await b.pesos.where('fecha').equals(fecha).first();
    const r: RegistroPeso = { id: existente?.id ?? nuevoId(), fecha, pesoKg: datos.pesoKg };
    if (datos.nota) r.nota = datos.nota;
    const v = validar(esquemaPeso, r, 'Peso');
    await b.pesos.put(v);
    await sincronizarPerfilConPesos();
    return v;
  });
}

/** Edita un registro de peso. Falla si se mueve a una fecha que ya tiene peso. */
export async function editarPeso(id: string, cambios: { pesoKg?: number; fecha?: string; nota?: string | null }): Promise<RegistroPeso> {
  const b = bd();
  return b.transaction('rw', [b.pesos, b.perfil], async () => {
    const actual = await b.pesos.get(id);
    if (!actual) throw new ErrorDatos('El registro de peso ya no existe.');
    if (cambios.fecha !== undefined && cambios.fecha !== actual.fecha) {
      if (!esFechaValida(cambios.fecha)) throw new ErrorDatos(`Fecha inválida: "${cambios.fecha}".`, 'fecha');
      if (await b.pesos.where('fecha').equals(cambios.fecha).count()) {
        throw new ErrorDatos('Ya hay un peso registrado en esa fecha.', 'fecha');
      }
    }
    const nuevo: RegistroPeso = { ...actual, pesoKg: cambios.pesoKg ?? actual.pesoKg, fecha: cambios.fecha ?? actual.fecha };
    if (cambios.nota === null || cambios.nota === '') delete nuevo.nota;
    else if (cambios.nota !== undefined) nuevo.nota = cambios.nota;
    const v = validar(esquemaPeso, nuevo, 'Peso');
    await b.pesos.put(v);
    await sincronizarPerfilConPesos();
    return v;
  });
}

export async function eliminarPeso(id: string): Promise<void> {
  const b = bd();
  await b.transaction('rw', [b.pesos, b.perfil], async () => {
    await b.pesos.delete(id);
    await sincronizarPerfilConPesos();
  });
}

/** Pesos ordenados por fecha; opcionalmente en [desde, hasta]. */
export async function listarPesos(desde?: string, hasta?: string): Promise<RegistroPeso[]> {
  const t = bd().pesos;
  if (desde === undefined && hasta === undefined) return t.orderBy('fecha').toArray();
  return t.where('fecha').between(desde ?? '0000-01-01', hasta ?? '9999-12-31', true, true).toArray();
}

export async function pesoDeFecha(fecha: string): Promise<RegistroPeso | undefined> {
  return bd().pesos.where('fecha').equals(fecha).first();
}
