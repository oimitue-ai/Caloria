/**
 * Utilidades de fecha LOCAL. El "día" de un registro es siempre la fecha civil del
 * dispositivo ('YYYY-MM-DD'), nunca la fecha UTC: a las 20:00 en America/Mexico_City
 * `toISOString()` ya devuelve el día siguiente. Aquí el día se obtiene con los
 * componentes locales de `Date` y la aritmética se hace sobre el calendario
 * (vía Date.UTC), por lo que no le afectan zonas ni cambios de horario.
 */

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 86_400_000;

const dos = (n: number): string => String(n).padStart(2, '0');

function componer(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, '0')}-${dos(mes)}-${dos(dia)}`;
}

/** Fecha civil local de un instante. */
export function fechaLocal(instante: Date = new Date()): string {
  return componer(instante.getFullYear(), instante.getMonth() + 1, instante.getDate());
}

/** Fecha civil local de hoy. */
export function hoy(): string {
  return fechaLocal(new Date());
}

/** Fecha civil de un instante en una zona IANA concreta (p. ej. 'America/Mexico_City'). */
export function fechaEnZona(instante: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instante);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

let ultimaMarca = 0;

/**
 * Marca de tiempo ISO (UTC) para `creado`/`modificado`. NO usar para obtener el día.
 * Estrictamente creciente dentro de la sesión (si dos llamadas caen en el mismo milisegundo
 * se suma 1 ms), para que el orden de captura sea estable.
 */
export function ahoraISO(): string {
  const t = Math.max(Date.now(), ultimaMarca + 1);
  ultimaMarca = t;
  return new Date(t).toISOString();
}

/** true si es 'YYYY-MM-DD' y corresponde a un día real del calendario. */
export function esFechaValida(fecha: unknown): fecha is string {
  if (typeof fecha !== 'string') return false;
  const m = RE_FECHA.exec(fecha);
  if (!m) return false;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (me < 1 || me > 12 || d < 1) return false;
  return d <= diasDelMes(a, me);
}

export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function partes(fecha: string): [number, number, number] {
  const m = RE_FECHA.exec(fecha);
  if (!m) throw new Error(`Fecha inválida: "${fecha}" (se esperaba AAAA-MM-DD)`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Número de día absoluto (días desde 1970-01-01) de una fecha civil. */
function aNumero(fecha: string): number {
  const [a, m, d] = partes(fecha);
  return Math.round(Date.UTC(a, m - 1, d) / MS_DIA);
}

function deNumero(n: number): string {
  const d = new Date(n * MS_DIA);
  return componer(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** `Date` a medianoche local de esa fecha civil (para componentes de calendario). */
export function aDate(fecha: string): Date {
  const [a, m, d] = partes(fecha);
  return new Date(a, m - 1, d);
}

export function sumarDias(fecha: string, dias: number): string {
  return deNumero(aNumero(fecha) + dias);
}

/** Días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  return aNumero(hasta) - aNumero(desde);
}

/** Todas las fechas del intervalo, ambos extremos incluidos. Vacío si desde > hasta. */
export function rangoFechas(desde: string, hasta: string): string[] {
  const a = aNumero(desde);
  const b = aNumero(hasta);
  const r: string[] = [];
  for (let n = a; n <= b; n++) r.push(deNumero(n));
  return r;
}

/** Día de la semana con lunes = 0 … domingo = 6. */
export function diaSemana(fecha: string): number {
  // 1970-01-01 fue jueves (3 con lunes = 0)
  return (((aNumero(fecha) + 3) % 7) + 7) % 7;
}

/** Lunes de la semana (lunes–domingo) que contiene la fecha. */
export function inicioSemana(fecha: string): string {
  return sumarDias(fecha, -diaSemana(fecha));
}

/** Domingo de la semana que contiene la fecha. */
export function finSemana(fecha: string): string {
  return sumarDias(inicioSemana(fecha), 6);
}

export function inicioMes(fecha: string): string {
  const [a, m] = partes(fecha);
  return componer(a, m, 1);
}

export function finMes(fecha: string): string {
  const [a, m] = partes(fecha);
  return componer(a, m, diasDelMes(a, m));
}

/** 'YYYY-MM' de la fecha. */
export function claveMes(fecha: string): string {
  return fecha.slice(0, 7);
}

/** Suma meses conservando el día cuando existe (31 ene + 1 mes = 28/29 feb). */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = partes(fecha);
  const total = a * 12 + (m - 1) + meses;
  const a2 = Math.floor(total / 12);
  const m2 = (total % 12) + 1;
  return componer(a2, m2, Math.min(d, diasDelMes(a2, m2)));
}

export interface Periodo { inicio: string; fin: string }

/** Semanas lunes–domingo que tocan el intervalo (completas, pueden salirse del intervalo). */
export function semanasEnRango(desde: string, hasta: string): Periodo[] {
  const r: Periodo[] = [];
  for (let i = inicioSemana(desde); i <= hasta; i = sumarDias(i, 7)) {
    r.push({ inicio: i, fin: sumarDias(i, 6) });
  }
  return r;
}

/** Meses calendario que tocan el intervalo. */
export function mesesEnRango(desde: string, hasta: string): (Periodo & { mes: string })[] {
  const r: (Periodo & { mes: string })[] = [];
  for (let i = inicioMes(desde); i <= hasta; i = sumarMeses(i, 1)) {
    r.push({ mes: claveMes(i), inicio: i, fin: finMes(i) });
  }
  return r;
}

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function nombreDia(fecha: string): string {
  return DIAS[diaSemana(fecha)];
}

/** Nombre del mes de una fecha 'YYYY-MM-DD' o clave 'YYYY-MM'. */
export function nombreMes(fechaOMes: string): string {
  return MESES[Number(fechaOMes.slice(5, 7)) - 1] ?? '';
}

/** "lunes 16 de noviembre de 2026" */
export function formatearFechaLarga(fecha: string): string {
  const [a, m, d] = partes(fecha);
  return `${nombreDia(fecha)} ${d} de ${MESES[m - 1]} de ${a}`;
}

/** "16 nov" (o "16 nov 2025" con `conAnio`) */
export function formatearFechaCorta(fecha: string, conAnio = false): string {
  const [a, m, d] = partes(fecha);
  return `${d} ${MESES[m - 1].slice(0, 3)}${conAnio ? ` ${a}` : ''}`;
}
