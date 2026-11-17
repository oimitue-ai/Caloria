/**
 * Gráficas (recharts). Reglas del sistema: barras ≤ 24 px con punta redondeada de 4 px,
 * líneas de 2 px, puntos ≥ 8 px con anillo del color de la superficie, rejilla tenue de 1 px,
 * una sola escala por gráfica, leyenda cuando hay ≥ 2 series, texto en tinta (nunca en el
 * color de la serie) y una tabla equivalente para quien no ve la gráfica.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatear } from '../../nucleo';
import { cx } from '../util';

const EJE = { fontSize: 12, fill: 'var(--c-tinta-3)' };

/** Marcas "redondas" del eje (múltiplos de 1, 2, 2.5 o 5 × 10ⁿ), unas 4–6. */
export function marcasRedondas(min: number, max: number, objetivo = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (max <= min) max = min + 1;
  const bruto = (max - min) / objetivo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= bruto) ?? 10 * mag;
  const inicio = Math.floor(min / paso) * paso;
  const fin = Math.ceil(max / paso) * paso;
  const r: number[] = [];
  for (let v = inicio; v <= fin + paso / 1e6; v += paso) r.push(Math.round(v * 1e6) / 1e6);
  return r;
}

function maximo(valores: (number | undefined)[]): number {
  return Math.max(0, ...valores.filter((v): v is number => v !== undefined));
}

export interface SerieInfo { clave: string; nombre: string; color: string; tipo: 'barra' | 'linea' | 'punto' | 'meta'; unidad: string; decimales?: number }

function Leyenda({ series }: { series: SerieInfo[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-tinta-2">
      {series.map((s) => (
        <li key={s.clave} className="flex items-center gap-2">
          {s.tipo === 'barra' && <span className="h-3 w-3 rounded-[3px]" style={{ background: s.color }} aria-hidden />}
          {s.tipo === 'linea' && <span className="h-[3px] w-4 rounded-full" style={{ background: s.color }} aria-hidden />}
          {s.tipo === 'meta' && <span className="w-4 border-t-2 border-dashed" style={{ borderColor: s.color }} aria-hidden />}
          {s.tipo === 'punto' && <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />}
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

/** Contenido del tooltip: el valor manda, el nombre de la serie acompaña. */
function Globo({ titulo, filas }: { titulo: string; filas: { nombre: string; valor: string; color: string; tipo: SerieInfo['tipo'] }[] }) {
  return (
    <div className="min-w-40 rounded-xl border border-borde bg-superficie px-3 py-2 text-sm sombra-flotante">
      <p className="mb-1 font-semibold text-tinta-2">{titulo}</p>
      {filas.map((f) => (
        <p key={f.nombre} className="flex items-center gap-2">
          <span className={cx('w-3', f.tipo === 'punto' || f.tipo === 'barra' ? 'h-2.5 rounded-sm' : 'h-[3px] rounded-full')} style={{ background: f.color }} aria-hidden />
          <span className="font-semibold text-tinta cifras">{f.valor}</span>
          <span className="text-tinta-3">{f.nombre}</span>
        </p>
      ))}
    </div>
  );
}

/** Tabla equivalente (accesibilidad y consulta de valores exactos). */
function TablaDatos({ datos, series: todas, etiquetaX }: { datos: Record<string, unknown>[]; series: SerieInfo[]; etiquetaX: string }) {
  const series = todas.filter((s) => datos.some((d) => d[s.clave] !== undefined));
  return (
    <div className="max-h-72 overflow-auto rounded-control border border-borde">
      <table className="w-full text-sm cifras">
        <thead className="sticky top-0 bg-hundido text-left text-tinta-2">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">{etiquetaX}</th>
            {series.map((s) => <th key={s.clave} scope="col" className="px-3 py-2 text-right font-semibold">{s.nombre} ({s.unidad})</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {datos.map((d, i) => (
            <tr key={i}>
              <th scope="row" className="px-3 py-1.5 text-left font-normal text-tinta-2">{String(d.etiquetaLarga ?? d.etiqueta)}</th>
              {series.map((s) => (
                <td key={s.clave} className="px-3 py-1.5 text-right">{formatear(d[s.clave] as number | undefined, s.decimales ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarcoGrafica({ titulo, descripcion, series, datos, etiquetaX, children, alto = 240, accion }: {
  titulo: string;
  descripcion?: ReactNode;
  series: SerieInfo[];
  datos: Record<string, unknown>[];
  etiquetaX: string;
  children: ReactNode;
  alto?: number;
  accion?: ReactNode;
}) {
  const [tabla, setTabla] = useState(false);
  return (
    <figure className="rounded-tarjeta border border-borde/70 bg-superficie p-4 sm:p-5">
      <figcaption className="mb-3 flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-[12rem] flex-1">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          {descripcion && <p className="text-sm text-tinta-2">{descripcion}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {accion}
          <button type="button" onClick={() => setTabla((t) => !t)} aria-pressed={tabla}
            className="min-h-10 shrink-0 rounded-full px-3 text-sm font-semibold text-talavera hover:bg-talavera-tinte">
            {tabla ? 'Ver gráfica' : 'Ver tabla'}
          </button>
        </div>
      </figcaption>
      <Leyenda series={series} />
      {datos.length === 0 ? (
        <p className="flex items-center justify-center text-center text-tinta-3" style={{ height: alto }}>Aún no hay datos en este periodo.</p>
      ) : tabla ? <TablaDatos datos={datos} series={series} etiquetaX={etiquetaX} /> : (
        <div style={{ height: alto }} className="-ml-2" role="img" aria-label={`${titulo}. Usa “Ver tabla” para leer los valores.`}>
          {children}
        </div>
      )}
    </figure>
  );
}

// ───────────────────────── Calorías vs meta ─────────────────────────

export interface PuntoKcal { etiqueta: string; etiquetaLarga: string; kcal?: number; meta?: number }

export function GraficaKcal({ datos, titulo, descripcion }: { datos: PuntoKcal[]; titulo: string; descripcion?: ReactNode }) {
  const series: SerieInfo[] = [
    { clave: 'kcal', nombre: 'Consumido', color: 'var(--c-grafica-kcal)', tipo: 'barra', unidad: 'kcal' },
    { clave: 'meta', nombre: 'Meta', color: 'var(--c-grafica-meta)', tipo: 'meta', unidad: 'kcal' },
  ];
  const marcas = marcasRedondas(0, maximo(datos.flatMap((d) => [d.kcal, d.meta])) || 2000, 4);
  return (
    <MarcoGrafica titulo={titulo} descripcion={descripcion} series={series} datos={datos as unknown as Record<string, unknown>[]} etiquetaX="Periodo">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--c-borde)" strokeWidth={1} />
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: 'var(--c-borde)' }} interval="preserveStartEnd" minTickGap={14} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} width={46} ticks={marcas} domain={[0, marcas[marcas.length - 1]]} tickFormatter={(v: number) => formatear(v, 0)} />
          <Tooltip
            cursor={{ fill: 'var(--c-hundido)', opacity: 0.7 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as PuntoKcal;
              return (
                <Globo titulo={d.etiquetaLarga} filas={[
                  { nombre: 'consumido', valor: d.kcal !== undefined ? `${formatear(d.kcal, 0)} kcal` : 'sin registro', color: 'var(--c-grafica-kcal)', tipo: 'barra' },
                  ...(d.meta ? [{ nombre: 'meta', valor: `${formatear(d.meta, 0)} kcal`, color: 'var(--c-grafica-meta)', tipo: 'meta' as const }] : []),
                ]} />
              );
            }}
          />
          <Bar dataKey="kcal" fill="var(--c-grafica-kcal)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="meta" stroke="var(--c-grafica-meta)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </MarcoGrafica>
  );
}

// ───────────────────────── Macronutrientes ─────────────────────────

export interface PuntoMacros { etiqueta: string; etiquetaLarga: string; proteina?: number; carbohidratos?: number; grasa?: number }

export function GraficaMacros({ datos, titulo, descripcion }: { datos: PuntoMacros[]; titulo: string; descripcion?: ReactNode }) {
  const series: SerieInfo[] = [
    { clave: 'proteina', nombre: 'Proteína', color: 'var(--c-proteina)', tipo: 'linea', unidad: 'g' },
    { clave: 'carbohidratos', nombre: 'Carbohidratos', color: 'var(--c-carbos)', tipo: 'linea', unidad: 'g' },
    { clave: 'grasa', nombre: 'Grasa', color: 'var(--c-grasa)', tipo: 'linea', unidad: 'g' },
  ];
  const conPuntos = datos.length <= 14;
  const marcas = marcasRedondas(0, maximo(datos.flatMap((d) => [d.proteina, d.carbohidratos, d.grasa])) || 100, 4);
  return (
    <MarcoGrafica titulo={titulo} descripcion={descripcion} series={series} datos={datos as unknown as Record<string, unknown>[]} etiquetaX="Periodo">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--c-borde)" strokeWidth={1} />
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: 'var(--c-borde)' }} interval="preserveStartEnd" minTickGap={14} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} width={44} ticks={marcas} domain={[0, marcas[marcas.length - 1]]} tickFormatter={(v: number) => `${formatear(v, 0)} g`} />
          <Tooltip
            cursor={{ stroke: 'var(--c-tinta-3)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as PuntoMacros;
              return (
                <Globo titulo={d.etiquetaLarga} filas={series.map((s) => ({
                  nombre: s.nombre.toLowerCase(), color: s.color, tipo: 'linea' as const,
                  valor: d[s.clave as keyof PuntoMacros] !== undefined ? `${formatear(d[s.clave as keyof PuntoMacros] as number, 0)} g` : 'sin registro',
                }))} />
              );
            }}
          />
          {series.map((s) => (
            <Line key={s.clave} type="monotone" dataKey={s.clave} stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              dot={conPuntos ? { r: 4, fill: s.color, stroke: 'var(--c-superficie)', strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: s.color, stroke: 'var(--c-superficie)', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </MarcoGrafica>
  );
}

// ───────────────────────── Peso y tendencia ─────────────────────────

export interface PuntoPesoGrafica { etiqueta: string; etiquetaLarga: string; peso?: number; tendencia?: number }

export function GraficaPeso({ datos, titulo, descripcion, objetivo, alto, accion }: {
  datos: PuntoPesoGrafica[]; titulo: string; descripcion?: ReactNode; objetivo?: number | null; alto?: number; accion?: ReactNode;
}) {
  const series: SerieInfo[] = [
    { clave: 'peso', nombre: 'Peso del día', color: 'var(--c-grafica-meta)', tipo: 'punto', unidad: 'kg', decimales: 1 },
    { clave: 'tendencia', nombre: 'Tendencia', color: 'var(--c-grafica-kcal)', tipo: 'linea', unidad: 'kg', decimales: 1 },
  ];
  const seriesLeyenda: SerieInfo[] = objetivo
    ? [...series, { clave: 'objetivo', nombre: `Objetivo (${formatear(objetivo, 1)} kg)`, color: 'var(--c-tinta-3)', tipo: 'meta', unidad: 'kg' }]
    : series;
  const valores = datos.flatMap((d) => [d.peso, d.tendencia]).filter((v): v is number => v !== undefined);
  if (objetivo) valores.push(objetivo);
  const marcas = valores.length ? marcasRedondas(Math.min(...valores) - 0.3, Math.max(...valores) + 0.3, 4) : [0, 1];
  const min = marcas[0];
  const max = marcas[marcas.length - 1];
  return (
    <MarcoGrafica titulo={titulo} descripcion={descripcion} series={seriesLeyenda} datos={datos as unknown as Record<string, unknown>[]} etiquetaX="Fecha" alto={alto} accion={accion}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--c-borde)" strokeWidth={1} />
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: 'var(--c-borde)' }} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} width={40} domain={[min, max]} ticks={marcas} tickFormatter={(v: number) => formatear(v, 1)} />
          <Tooltip
            cursor={{ stroke: 'var(--c-tinta-3)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as PuntoPesoGrafica;
              return (
                <Globo titulo={d.etiquetaLarga} filas={[
                  ...(d.peso !== undefined ? [{ nombre: 'peso', valor: `${formatear(d.peso, 1)} kg`, color: 'var(--c-grafica-meta)', tipo: 'punto' as const }] : []),
                  ...(d.tendencia !== undefined ? [{ nombre: 'tendencia', valor: `${formatear(d.tendencia, 1)} kg`, color: 'var(--c-grafica-kcal)', tipo: 'linea' as const }] : []),
                ]} />
              );
            }}
          />
          <Scatter dataKey="peso" fill="var(--c-grafica-meta)" stroke="var(--c-superficie)" strokeWidth={2} isAnimationActive={false}
            shape={(p: { cx?: number; cy?: number }) => (p.cx === undefined || p.cy === undefined ? <g /> : <circle cx={p.cx} cy={p.cy} r={4} fill="var(--c-grafica-meta)" stroke="var(--c-superficie)" strokeWidth={2} opacity={0.75} />)} />
          <Line type="monotone" dataKey="tendencia" stroke="var(--c-grafica-kcal)" strokeWidth={2} dot={false}
            activeDot={{ r: 5, fill: 'var(--c-grafica-kcal)', stroke: 'var(--c-superficie)', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
          {objetivo ? (
            <Line dataKey={() => objetivo} name="Objetivo" stroke="var(--c-tinta-3)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </MarcoGrafica>
  );
}
