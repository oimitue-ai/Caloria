/**
 * Conversión de una cantidad expresada en cualquier unidad a la base nutricional
 * del alimento (g o ml).
 *
 * Reglas (en este orden):
 *  1. Porción del alimento. Si se indica `porcionEtiqueta` se usa exactamente esa porción
 *     (misma unidad y etiqueta). Para pieza / porcion / taza / cucharada / cucharadita sin
 *     etiqueta se usa la porción del alimento con esa unidad (la predeterminada o la primera).
 *  2. Conversión dimensional directa cuando la unidad es de la misma dimensión que la base
 *     (g, kg sobre base g; ml, l, taza, cucharada, cucharadita sobre base ml).
 *  3. Dimensión distinta (ml↔g): una porción del alimento con esa unidad, si existe; si no,
 *     SOLO con `densidad` (g/ml). Jamás se asume 1 g/ml.
 *  4. En cualquier otro caso: no convertible, con motivo en español.
 *
 * Nota sobre g/kg/ml/l: sin etiqueta NO se toma una porción cuya unidad sea g/ml de la misma
 * dimensión que la base (p. ej. "1 rebanada (27 g)" declarada con unidad g), porque
 * "150 g" debe ser siempre 150 g.
 *
 * Alimentos con `soloPorciones` (recetas de peso nominal) solo admiten la regla 1.
 */
import type { Alimento, BaseNutricional, Porcion, UnidadId } from '../tipos';

export type AlimentoConvertible = Pick<Alimento, 'base' | 'densidad' | 'porciones' | 'soloPorciones'>;

export type ResultadoConversion =
  | { ok: true; cantidadBase: number; porcion?: Porcion }
  | { ok: false; motivo: string };

export interface OpcionUnidad {
  unidad: UnidadId;
  /** Texto para mostrar en el selector */
  etiqueta: string;
  /** Presente cuando la opción es una Porcion del alimento; pásala a `convertirABase` */
  porcionEtiqueta?: string;
  /** Cuánto de la base equivale a 1 de esta opción */
  equivalencia: number;
  predeterminada?: boolean;
}

type Dimension = 'masa' | 'volumen';

/** Factor a g (masa) o a ml (volumen). pieza y porcion no tienen factor universal. */
export const FACTOR_UNIDAD: Partial<Record<UnidadId, { dimension: Dimension; factor: number }>> = {
  g: { dimension: 'masa', factor: 1 },
  kg: { dimension: 'masa', factor: 1000 },
  ml: { dimension: 'volumen', factor: 1 },
  l: { dimension: 'volumen', factor: 1000 },
  taza: { dimension: 'volumen', factor: 240 },
  cucharada: { dimension: 'volumen', factor: 15 },
  cucharadita: { dimension: 'volumen', factor: 5 },
};

export const NOMBRE_UNIDAD: Record<UnidadId, { singular: string; plural: string; abreviatura: string }> = {
  g: { singular: 'gramo', plural: 'gramos', abreviatura: 'g' },
  kg: { singular: 'kilogramo', plural: 'kilogramos', abreviatura: 'kg' },
  ml: { singular: 'mililitro', plural: 'mililitros', abreviatura: 'ml' },
  l: { singular: 'litro', plural: 'litros', abreviatura: 'l' },
  pieza: { singular: 'pieza', plural: 'piezas', abreviatura: 'pza' },
  taza: { singular: 'taza', plural: 'tazas', abreviatura: 'tza' },
  cucharada: { singular: 'cucharada', plural: 'cucharadas', abreviatura: 'cda' },
  cucharadita: { singular: 'cucharadita', plural: 'cucharaditas', abreviatura: 'cdita' },
  porcion: { singular: 'porción', plural: 'porciones', abreviatura: 'porc' },
};

const dimensionBase = (base: BaseNutricional): Dimension => (base === 'g' ? 'masa' : 'volumen');

const positivo = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Límite de una sola captura en la base (g o ml): 100 kg / 100 l. Evita registros absurdos (p. ej. "1e300"
 *  piezas guardaba 1.05e302 kcal y rompía totales, gráficas y estadísticas). Auditoría (Agente 4). */
export const MAXIMO_CANTIDAD_BASE = 100_000;

/** Evita residuos binarios (0.1 + 0.2) sin perder precisión útil. */
const limpiar = (n: number): number => Math.round(n * 1e6) / 1e6;

function porcionesValidas(alimento: AlimentoConvertible): Porcion[] {
  return (alimento.porciones ?? []).filter((p) => positivo(p.equivalencia));
}

function buscarPorcion(
  alimento: AlimentoConvertible, unidad: UnidadId, etiqueta?: string,
): Porcion | undefined {
  const deUnidad = porcionesValidas(alimento).filter((p) => p.unidad === unidad);
  if (etiqueta !== undefined) return deUnidad.find((p) => p.etiqueta === etiqueta);
  return deUnidad.find((p) => p.predeterminada) ?? deUnidad[0];
}

export function convertirABase(
  alimento: AlimentoConvertible,
  cantidad: number,
  unidad: UnidadId,
  porcionEtiqueta?: string,
): ResultadoConversion {
  const r = convertirSinLimite(alimento, cantidad, unidad, porcionEtiqueta);
  if (r.ok && r.cantidadBase > MAXIMO_CANTIDAD_BASE) {
    return { ok: false, motivo: `La cantidad es demasiado grande (más de ${MAXIMO_CANTIDAD_BASE / 1000} ${alimento.base === 'ml' ? 'litros' : 'kg'}). Revisa el número.` };
  }
  return r;
}

function convertirSinLimite(
  alimento: AlimentoConvertible,
  cantidad: number,
  unidad: UnidadId,
  porcionEtiqueta?: string,
): ResultadoConversion {
  if (!positivo(cantidad)) {
    return { ok: false, motivo: 'La cantidad debe ser un número mayor que cero.' };
  }
  const nombre = NOMBRE_UNIDAD[unidad];
  if (!nombre) return { ok: false, motivo: `Unidad desconocida: "${String(unidad)}".` };

  const conPorcion = (p: Porcion): ResultadoConversion =>
    ({ ok: true, cantidadBase: limpiar(cantidad * p.equivalencia), porcion: p });

  // 1. Porción explícita
  if (porcionEtiqueta !== undefined) {
    const p = buscarPorcion(alimento, unidad, porcionEtiqueta);
    if (p) return conPorcion(p);
  }

  const info = FACTOR_UNIDAD[unidad];
  const dimBase = dimensionBase(alimento.base);

  // 1 (bis). Medidas caseras y piezas: porción del alimento con esa unidad
  const esAbsoluta = unidad === 'g' || unidad === 'kg' || unidad === 'ml' || unidad === 'l';
  if (!esAbsoluta) {
    const p = buscarPorcion(alimento, unidad);
    if (p) return conPorcion(p);
  }

  if (alimento.soloPorciones) {
    return {
      ok: false,
      motivo: 'Este alimento solo se puede registrar por porciones (no tiene un peso real en gramos).',
    };
  }

  if (!info) {
    return {
      ok: false,
      motivo: `Este alimento no tiene definida una equivalencia para "${nombre.singular}".`,
    };
  }

  // 2. Misma dimensión
  if (info.dimension === dimBase) {
    return { ok: true, cantidadBase: limpiar(cantidad * info.factor) };
  }

  // 3. Dimensión distinta: porción específica o densidad
  const p = buscarPorcion(alimento, unidad);
  if (p) return conPorcion(p);

  if (positivo(alimento.densidad)) {
    const enOrigen = cantidad * info.factor; // ml si volumen, g si masa
    const cantidadBase = info.dimension === 'volumen'
      ? enOrigen * alimento.densidad // ml → g
      : enOrigen / alimento.densidad; // g → ml
    return { ok: true, cantidadBase: limpiar(cantidadBase) };
  }

  return {
    ok: false,
    motivo: info.dimension === 'volumen'
      ? `No se puede convertir ${nombre.plural} a gramos: este alimento no tiene densidad ni una porción de "${nombre.singular}" definida.`
      : `No se puede convertir ${nombre.plural} a mililitros: este alimento no tiene densidad conocida.`,
  };
}

/**
 * Unidades que la interfaz puede ofrecer para un alimento. Todas las opciones devueltas
 * son convertibles con `convertirABase(alimento, cantidad, opcion.unidad, opcion.porcionEtiqueta)`.
 * Orden: porciones del alimento (predeterminada primero), luego unidades de la base,
 * luego las que requieren densidad.
 */
export function unidadesDisponibles(alimento: AlimentoConvertible): OpcionUnidad[] {
  const opciones: OpcionUnidad[] = [];
  const vistas = new Set<string>();
  const porciones = porcionesValidas(alimento);

  for (const p of [...porciones].sort((a, b) => Number(!!b.predeterminada) - Number(!!a.predeterminada))) {
    const clave = `${p.unidad}|${p.etiqueta}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    opciones.push({
      unidad: p.unidad,
      etiqueta: p.etiqueta,
      porcionEtiqueta: p.etiqueta,
      equivalencia: p.equivalencia,
      ...(p.predeterminada ? { predeterminada: true } : {}),
    });
  }
  if (alimento.soloPorciones) return opciones;

  const dimBase = dimensionBase(alimento.base);
  const conPorcionPropia = new Set(porciones.map((p) => p.unidad));
  const genericas: UnidadId[] = ['g', 'kg', 'ml', 'l', 'taza', 'cucharada', 'cucharadita'];
  const misma: OpcionUnidad[] = [];
  const otra: OpcionUnidad[] = [];

  for (const unidad of genericas) {
    const info = FACTOR_UNIDAD[unidad]!;
    const esAbsoluta = unidad === 'g' || unidad === 'kg' || unidad === 'ml' || unidad === 'l';
    // Una medida casera con porción propia ya está en la lista (y sin etiqueta resuelve a ella).
    if ((!esAbsoluta || info.dimension !== dimBase) && conPorcionPropia.has(unidad)) continue;
    const r = convertirABase(alimento, 1, unidad);
    if (!r.ok) continue;
    const texto = info.dimension === 'volumen' && !esAbsoluta
      ? `${NOMBRE_UNIDAD[unidad].singular} (${info.factor} ml)`
      : NOMBRE_UNIDAD[unidad].plural;
    (info.dimension === dimBase ? misma : otra).push({
      unidad, etiqueta: texto, equivalencia: r.cantidadBase,
    });
  }
  return [...opciones, ...misma, ...otra];
}

/** Opción sugerida al abrir el formulario de registro. */
export function unidadPredeterminada(alimento: AlimentoConvertible): OpcionUnidad | undefined {
  const opciones = unidadesDisponibles(alimento);
  return opciones.find((o) => o.predeterminada) ?? opciones.find((o) => o.porcionEtiqueta) ?? opciones[0];
}

/** "2 piezas", "150 g", "1.5 tazas" — para mostrar la cantidad registrada. */
export function describirCantidad(cantidad: number, unidad: UnidadId, porcionEtiqueta?: string): string {
  const n = String(limpiar(cantidad));
  if (porcionEtiqueta) return `${n} × ${porcionEtiqueta}`;
  const u = NOMBRE_UNIDAD[unidad];
  if (unidad === 'g' || unidad === 'kg' || unidad === 'ml' || unidad === 'l') return `${n} ${u.abreviatura}`;
  return `${n} ${cantidad === 1 ? u.singular : u.plural}`;
}
