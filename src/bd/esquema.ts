/**
 * Base de datos IndexedDB (Dexie). Una sola instancia por pestaña: `bd()`.
 *
 * MIGRACIONES: nunca se edita una versión publicada. Para cambiar el esquema se agrega una
 * entrada nueva a `VERSIONES` con el número siguiente, sus `stores` (solo las tablas que
 * cambian; `null` borra una tabla) y, si hace falta, `migrar` para transformar los datos.
 * `VERSION_ESQUEMA` (la última) se graba en los respaldos.
 */
import Dexie from 'dexie';
import type { EntityTable, Table, Transaction } from 'dexie';
import type { Configuracion, Metas, Perfil, Receta, RegistroComida, RegistroPeso, Alimento } from '../tipos';
import type { AlimentoEnCache, Favorito, UsoAlimento } from './tipos';

export const NOMBRE_BD = 'caloria';

/** Clave única de las tablas de una sola fila (perfil, config). */
export const CLAVE_UNICA = 'actual';

interface VersionEsquema {
  version: number;
  stores: Record<string, string | null>;
  migrar?: (tx: Transaction) => Promise<void> | void;
}

export const VERSIONES: VersionEsquema[] = [
  {
    version: 1,
    stores: {
      perfil: '', // fila única, clave externa CLAVE_UNICA
      config: '', // fila única, clave externa CLAVE_UNICA
      metas: 'desde',
      registros: 'id, fecha, [fecha+comida], alimentoId',
      alimentosUsuario: 'id, nombre, codigoBarras',
      recetas: 'id, nombre, modificado',
      pesos: 'id, &fecha',
      usos: '[alimentoId+comida], alimentoId, comida, [comida+ultimoUso], [comida+usos], ultimoUso',
      favoritos: 'alimentoId, creado',
      cacheAlimentos: 'id, ultimoUso, alimento.codigoBarras',
    },
  },
];

export const VERSION_ESQUEMA = VERSIONES[VERSIONES.length - 1].version;

/** Nombres de todas las tablas (orden estable para respaldos). */
export const TABLAS = [
  'perfil', 'config', 'metas', 'registros', 'alimentosUsuario', 'recetas', 'pesos', 'usos', 'favoritos',
  'cacheAlimentos',
] as const;
export type NombreTabla = (typeof TABLAS)[number];

export class BaseCaloria extends Dexie {
  declare perfil: Table<Perfil, string>;
  declare config: Table<Configuracion, string>;
  declare metas: EntityTable<Metas, 'desde'>;
  declare registros: EntityTable<RegistroComida, 'id'>;
  declare alimentosUsuario: EntityTable<Alimento, 'id'>;
  declare recetas: EntityTable<Receta, 'id'>;
  declare pesos: EntityTable<RegistroPeso, 'id'>;
  /** recientes y frecuentes por comida */
  declare usos: Table<UsoAlimento, [string, string]>;
  declare favoritos: EntityTable<Favorito, 'alimentoId'>;
  declare cacheAlimentos: EntityTable<AlimentoEnCache, 'id'>;

  constructor(nombre = NOMBRE_BD) {
    super(nombre);
    for (const v of VERSIONES) {
      const ver = this.version(v.version).stores(v.stores);
      if (v.migrar) ver.upgrade(v.migrar);
    }
  }
}

let instancia: BaseCaloria | null = null;
let nombreActual = NOMBRE_BD;

/** Instancia compartida (se abre sola en la primera consulta). */
export function bd(): BaseCaloria {
  if (!instancia) instancia = new BaseCaloria(nombreActual);
  return instancia;
}

/**
 * Cambia la BD activa (pruebas, o perfiles separados). Cierra la instancia actual;
 * la siguiente llamada a `bd()` abre la nueva.
 */
export function usarBaseDeDatos(nombre: string = NOMBRE_BD): void {
  instancia?.close();
  instancia = null;
  nombreActual = nombre;
}

/** Cierra la conexión (la siguiente llamada a `bd()` la vuelve a abrir). */
export function cerrarBD(): void {
  instancia?.close();
  instancia = null;
}

/** Borra la base de datos completa del dispositivo. Irreversible. */
export async function borrarBaseDeDatos(): Promise<void> {
  cerrarBD();
  await Dexie.delete(nombreActual);
}

/** Identificador aleatorio (UUID v4). */
export function nuevoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
