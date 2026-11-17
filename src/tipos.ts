/**
 * CALORÍA — Contrato de tipos compartido entre módulos.
 * Dueño: orquestador. Los agentes NO cambian este archivo sin avisar; si necesitan
 * un campo nuevo lo agregan como opcional y lo anotan en docs/CAMBIOS_CONTRATO.md.
 *
 * Convenciones:
 *  - Los nutrientes se expresan SIEMPRE por 100 unidades de `base` (100 g o 100 ml).
 *  - `undefined` = dato faltante en la fuente. `0` = cero real. Nunca confundirlos.
 *  - Energía en kcal; macros en g; sodio y minerales en mg salvo que la clave diga otra cosa.
 */

export type UnidadId =
  | 'g' | 'kg' | 'ml' | 'l'
  | 'pieza' | 'taza' | 'cucharada' | 'cucharadita' | 'porcion';

export type BaseNutricional = 'g' | 'ml';

export type FuenteId =
  | 'usda_foundation' | 'usda_sr_legacy' | 'usda_fndds' | 'usda_branded'
  | 'off'            // Open Food Facts (ODbL) — se mantiene como conjunto separado
  | 'mx_conabio'     // Tabla de composición de alimentos extendida (INCMNSZ/CONABIO)
  | 'mx_bam'         // Base de Alimentos de México (INSP)
  | 'caloria_recetas'// Platillos mexicanos calculados por receta estandarizada
  | 'usuario'        // Alimentos personalizados
  | 'receta';        // Recetas del usuario

export type EstadoValidacion =
  | 'oficial'          // tabla de composición oficial / analítica
  | 'etiqueta'         // declarado por el fabricante (USDA Branded)
  | 'comunidad'        // aportado por usuarios (Open Food Facts)
  | 'receta_estandar'  // calculado a partir de ingredientes oficiales
  | 'usuario';

export interface Nutrientes {
  kcal?: number;
  proteina?: number;
  carbohidratos?: number;
  grasa?: number;
  grasaSaturada?: number;
  fibra?: number;
  azucares?: number;
  /** mg */
  sodio?: number;
  /** Vitaminas y minerales. Claves con unidad: calcio_mg, hierro_mg, potasio_mg,
   *  vitamina_c_mg, vitamina_a_ug, vitamina_d_ug, vitamina_b12_ug, folato_ug, colesterol_mg, ... */
  micros?: Record<string, number>;
}

/** Medida casera o porción de un alimento, con su equivalencia en la base del alimento. */
export interface Porcion {
  /** Texto para mostrar: "1 pieza mediana", "1 taza", "1 rebanada (27 g)" */
  etiqueta: string;
  /** Unidad a la que corresponde esta equivalencia */
  unidad: UnidadId;
  /** Cuánto de `base` (g o ml) equivale a 1 de esta unidad */
  equivalencia: number;
  /** true si es la porción sugerida por defecto al registrar */
  predeterminada?: boolean;
}

export interface Alimento {
  /** `${fuente}:${idOriginal}` — único global */
  id: string;
  fuente: FuenteId;
  idOriginal: string;
  /** Nombre para mostrar, en español */
  nombre: string;
  /** Nombre tal como viene en la fuente */
  nombreOriginal: string;
  idiomaOriginal: string; // 'es' | 'en' | ...
  /** true si `nombre` es traducción automática del original */
  nombreTraducido?: boolean;
  sinonimos?: string[];
  categoria?: string;
  marca?: string;
  codigoBarras?: string;
  base: BaseNutricional;
  nutrientes: Nutrientes;
  /** g por ml. Solo si se conoce de una fuente confiable. Sin densidad NO se convierte ml↔g. */
  densidad?: number;
  porciones: Porcion[];
  /** Fecha ISO de actualización en la fuente */
  actualizado?: string;
  validacion: EstadoValidacion;
  mexicano?: boolean;
  notas?: string;
  /** ids de otros registros equivalentes detectados en la deduplicación */
  equivalentes?: string[];
  /** true si el alimento SOLO puede registrarse mediante sus `porciones` (p. ej. receta que mezcla
   *  g y ml sin peso final: su peso en gramos es nominal y no debe ofrecerse g/kg). Ver CAMBIOS_CONTRATO.md */
  soloPorciones?: boolean;
  /** true si la energía declarada no cuadra con 4/4/9 kcal por g de P/C/G (±30 % o 25 kcal). Se conserva el
   *  registro; la interfaz puede mostrar un aviso. Ver CAMBIOS_CONTRATO.md (Agente 1) */
  atipico?: boolean;
}

/** Fila compacta que devuelve el buscador (suficiente para identificar y registrar rápido). */
export interface ResultadoBusqueda {
  id: string;
  nombre: string;
  nombreOriginal?: string;
  marca?: string;
  categoria?: string;
  fuente: FuenteId;
  validacion: EstadoValidacion;
  base: BaseNutricional;
  kcal?: number;
  proteina?: number;
  carbohidratos?: number;
  grasa?: number;
  porcionSugerida?: Porcion;
  mexicano?: boolean;
  puntuacion: number;
}

export interface OpcionesBusqueda {
  limite?: number;   // por defecto 25
  pagina?: number;   // 0-based
  /** incluir productos de marca en línea (fragmentos remotos); por defecto true */
  incluirMarcas?: boolean;
  senal?: AbortSignal;
}

export interface RespuestaBusqueda {
  resultados: ResultadoBusqueda[];
  hayMas: boolean;
  /** true si parte del catálogo (marcas) no pudo consultarse por estar sin conexión */
  parcial?: boolean;
}

export interface FuenteManifiesto {
  id: FuenteId;
  nombre: string;
  version: string;
  licencia: string;
  atribucion: string;
  url: string;
  registros: number;
  fechaImportacion: string;
}

export interface ManifiestoCatalogo {
  version: string;
  generado: string;
  totalRegistros: number;
  fuentes: FuenteManifiesto[];
}

/** API del catálogo que consume la interfaz. Implementación en src/catalogo/ (Agente 1). */
export interface ServicioCatalogo {
  iniciar(): Promise<ManifiestoCatalogo>;
  buscar(texto: string, opciones?: OpcionesBusqueda): Promise<RespuestaBusqueda>;
  obtener(id: string): Promise<Alimento | null>;
  porCodigoBarras(codigo: string): Promise<Alimento | null>;
  manifiesto(): ManifiestoCatalogo | null;
}

// ───────────────────────── Datos del usuario ─────────────────────────

export type ComidaId =
  | 'desayuno' | 'colacion1' | 'almuerzo' | 'comida' | 'cena' | 'colacion2';

export const COMIDAS: { id: ComidaId; nombre: string }[] = [
  { id: 'desayuno', nombre: 'Desayuno' },
  { id: 'colacion1', nombre: 'Primera colación' },
  { id: 'almuerzo', nombre: 'Almuerzo' },
  { id: 'comida', nombre: 'Comida' },
  { id: 'cena', nombre: 'Cena' },
  { id: 'colacion2', nombre: 'Segunda colación' },
];

/** Totales calculados de un registro o de un conjunto de registros. */
export interface Totales {
  kcal: number;
  proteina: number;
  carbohidratos: number;
  grasa: number;
  grasaSaturada?: number;
  fibra?: number;
  azucares?: number;
  sodio?: number;
}

/**
 * Alimento registrado en una comida. Guarda una INSTANTÁNEA del alimento
 * (nombre, nutrientes por 100, porciones) para que el historial no cambie
 * si después se edita o actualiza el alimento.
 */
export interface RegistroComida {
  id: string;
  /** 'YYYY-MM-DD' en hora local */
  fecha: string;
  comida: ComidaId;
  alimentoId: string;
  instantanea: Pick<Alimento,
    'nombre' | 'marca' | 'fuente' | 'base' | 'nutrientes' | 'densidad' | 'porciones' | 'soloPorciones'>;
  cantidad: number;
  unidad: UnidadId;
  /** etiqueta de la porción usada cuando unidad es pieza/taza/porcion… */
  porcionEtiqueta?: string;
  /** cantidad convertida a la base (g o ml) al momento de registrar */
  cantidadBase: number;
  /** totales calculados al registrar/editar la cantidad */
  totales: Totales;
  creado: string;
  modificado: string;
}

export interface IngredienteReceta {
  alimentoId: string;
  instantanea: RegistroComida['instantanea'];
  cantidad: number;
  unidad: UnidadId;
  porcionEtiqueta?: string;
  cantidadBase: number;
}

export interface Receta {
  id: string;
  nombre: string;
  ingredientes: IngredienteReceta[];
  porciones: number;
  /** peso total cocinado opcional (g) para poder registrar por gramos */
  pesoFinalG?: number;
  notas?: string;
  creado: string;
  modificado: string;
}

export type Sexo = 'hombre' | 'mujer';
export type NivelActividad = 'sedentario' | 'ligero' | 'moderado' | 'activo' | 'muy_activo';
export type Objetivo = 'perder' | 'mantener' | 'ganar';

export interface Perfil {
  nombre?: string;
  edad?: number;
  sexo?: Sexo;
  estaturaCm?: number;
  pesoActualKg?: number;
  pesoInicialKg?: number;
  pesoObjetivoKg?: number;
  actividad?: NivelActividad;
  objetivo?: Objetivo;
  /** kg por semana deseados (positivo); el signo lo da `objetivo` */
  ritmoKgSemana?: number;
}

export interface Metas {
  kcal: number;
  proteina: number;
  carbohidratos: number;
  grasa: number;
  /** true si el usuario modificó manualmente la propuesta */
  personalizada?: boolean;
  /** fecha desde la que aplica (para evaluar cumplimiento histórico con la meta vigente) */
  desde: string;
}

export interface RegistroPeso {
  id: string;
  fecha: string; // 'YYYY-MM-DD'
  pesoKg: number;
  nota?: string;
}

export interface Configuracion {
  tema: 'claro' | 'oscuro' | 'sistema';
  ultimoRespaldo?: string;
  recordarRespaldoDias?: number;
}
