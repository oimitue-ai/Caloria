/** Tipos propios de la capa de persistencia (no forman parte del contrato compartido). */
import type { Alimento, ComidaId, RegistroComida, UnidadId } from '../tipos';

export type Instantanea = RegistroComida['instantanea'];

/**
 * Uso de un alimento en una comida concreta: alimenta "recientes" y "frecuentes" y recuerda la
 * última cantidad/unidad para volver a registrarlo en un toque. Clave: [alimentoId+comida].
 */
export interface UsoAlimento {
  alimentoId: string;
  comida: ComidaId;
  nombre: string;
  marca?: string;
  instantanea: Instantanea;
  cantidad: number;
  unidad: UnidadId;
  porcionEtiqueta?: string;
  /** veces que se registró en esa comida */
  usos: number;
  /** ISO del último registro */
  ultimoUso: string;
}

export interface Favorito {
  alimentoId: string;
  nombre: string;
  marca?: string;
  instantanea: Instantanea;
  creado: string;
}

/** Alimento del catálogo que el usuario ya usó: se guarda completo para funcionar sin conexión. */
export interface AlimentoEnCache {
  id: string;
  alimento: Alimento;
  ultimoUso: string;
}

/** Error de validación o de datos con mensaje en español apto para mostrar. */
export class ErrorDatos extends Error {
  readonly campo?: string;
  constructor(mensaje: string, campo?: string) {
    super(mensaje);
    this.name = 'ErrorDatos';
    this.campo = campo;
  }
}
