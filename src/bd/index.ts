/** API pública de persistencia (IndexedDB/Dexie). Ver docs/API_NUCLEO.md */
export {
  bd, BaseCaloria, borrarBaseDeDatos, cerrarBD, nuevoId, usarBaseDeDatos, NOMBRE_BD, TABLAS, VERSION_ESQUEMA,
} from './esquema';
export type { NombreTabla } from './esquema';
export * from './tipos';
export * from './registros';
export * from './alimentos';
export * from './recetas';
export * from './pesos';
export * from './perfil';
export * from './almacenamiento';
export * from './hooks';
export { describirErrores, validar } from './validacion';
