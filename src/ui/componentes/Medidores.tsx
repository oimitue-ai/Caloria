import { formatear } from '../../nucleo';
import { cx, kcal } from '../util';

export type Macro = 'proteina' | 'carbohidratos' | 'grasa';

export const MACROS: { id: Macro; nombre: string; corto: string; color: string; fondo: string; texto: string; sobre: string; kcalPorG: number }[] = [
  { id: 'proteina', nombre: 'Proteína', corto: 'Prot.', color: 'var(--c-proteina)', fondo: 'bg-proteina', texto: 'text-proteina', sobre: 'text-white', kcalPorG: 4 },
  { id: 'carbohidratos', nombre: 'Carbohidratos', corto: 'Carb.', color: 'var(--c-carbos)', fondo: 'bg-carbos', texto: 'text-carbos', sobre: 'text-[#16213a]', kcalPorG: 4 },
  { id: 'grasa', nombre: 'Grasa', corto: 'Grasa', color: 'var(--c-grasa)', fondo: 'bg-grasa', texto: 'text-grasa', sobre: 'text-white', kcalPorG: 9 },
];

/** Arco SVG como fracción de circunferencia. */
function arco(r: number, fraccion: number) {
  const c = 2 * Math.PI * r;
  return { strokeDasharray: `${Math.max(0, Math.min(1, fraccion)) * c} ${c}` };
}

/**
 * Anillo de calorías: el número grande es lo que queda por comer (o el exceso).
 * La vuelta se llena en talavera; si se rebasa la meta, el excedente se dibuja encima en rojo chile.
 */
export function AnilloKcal({ consumido, meta, tam = 196 }: { consumido: number; meta: number | null; tam?: number }) {
  const r = 84;
  const grosor = 15;
  const fraccion = meta && meta > 0 ? consumido / meta : 0;
  const exceso = meta ? consumido - meta : 0;
  const restantes = meta ? meta - consumido : null;
  const etiqueta = meta
    ? `Consumido ${kcal(consumido)} de ${kcal(meta)} kilocalorías. ${exceso > 0 ? `Excedido por ${kcal(exceso)}.` : `Quedan ${kcal(restantes)}.`}`
    : `Consumido ${kcal(consumido)} kilocalorías. Sin meta definida.`;
  return (
    <div className="relative shrink-0" style={{ width: tam, height: tam }} role="img" aria-label={etiqueta}>
      <svg viewBox="0 0 200 200" className="size-full -rotate-90" aria-hidden>
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--c-hundido)" strokeWidth={grosor} />
        {meta && fraccion > 0 && (
          <circle cx="100" cy="100" r={r} fill="none" stroke="var(--c-talavera)" strokeWidth={grosor} strokeLinecap="round"
            style={{ ...arco(r, Math.min(fraccion, 1)), transition: 'stroke-dasharray 600ms var(--ease-salida)' }} />
        )}
        {meta && fraccion > 1 && (
          <circle cx="100" cy="100" r={r} fill="none" stroke="var(--c-exceso)" strokeWidth={grosor - 5} strokeLinecap="round"
            style={{ ...arco(r, Math.min(fraccion - 1, 1)), transition: 'stroke-dasharray 600ms var(--ease-salida)' }} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden>
        {meta ? (
          <>
            <span className={cx('font-display font-bold leading-none tracking-[-0.04em] cifras', exceso > 0 ? 'text-exceso' : 'text-tinta')}
              style={{ fontSize: tam * 0.24, fontVariationSettings: '"wdth" 90' }}>
              {kcal(Math.abs(restantes ?? 0))}
            </span>
            <span className="mt-1 text-sm font-semibold text-tinta-2">{exceso > 0 ? 'kcal de más' : 'kcal restantes'}</span>
          </>
        ) : (
          <>
            <span className="font-display font-bold leading-none tracking-[-0.04em] cifras" style={{ fontSize: tam * 0.22 }}>{kcal(consumido)}</span>
            <span className="mt-1 text-sm font-semibold text-tinta-2">kcal consumidas</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Barra de un macronutriente con gramos y % de la meta. `compacta`: para tres columnas en móvil. */
export function BarraMacro({ macro, valor, meta, compacta }: { macro: Macro; valor: number; meta: number | null; compacta?: boolean }) {
  const info = MACROS.find((m) => m.id === macro)!;
  const pct = meta && meta > 0 ? valor / meta : null;
  const alto = pct !== null && pct > 1.1;
  const barra = (
    <div
      className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-hundido"
      role="progressbar"
      aria-label={info.nombre}
      aria-valuemin={0}
      aria-valuemax={meta ?? undefined}
      aria-valuenow={Math.round(valor)}
      aria-valuetext={meta ? `${formatear(valor, 0)} de ${formatear(meta, 0)} gramos (${formatear((pct ?? 0) * 100, 0)} %)` : `${formatear(valor, 0)} gramos`}
    >
      <div className={cx('h-full rounded-full', info.fondo)} style={{ width: `${Math.min(1, pct ?? 0) * 100}%`, transition: 'width 500ms var(--ease-salida)' }} />
    </div>
  );
  if (compacta) {
    return (
      <div className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <span className={cx('size-2.5 shrink-0 rounded-full', info.fondo)} aria-hidden />{info.nombre === 'Carbohidratos' ? 'Carbohidr.' : info.nombre}
        </span>
        {barra}
        <p className="mt-1 text-sm cifras">
          <span className="font-semibold">{formatear(valor, 0)}</span>
          <span className="text-tinta-3">{meta ? ` / ${formatear(meta, 0)} g` : ' g'}</span>
        </p>
        {meta ? <p className={cx('text-xs cifras', alto ? 'font-semibold text-exceso' : 'text-tinta-3')}>{formatear((pct ?? 0) * 100, 0)} % de la meta</p> : null}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className={cx('size-2.5 rounded-full', info.fondo)} aria-hidden />
          {info.nombre}
        </span>
        <span className="text-sm text-tinta-2 cifras">
          <span className="font-semibold text-tinta">{formatear(valor, 0)}</span>
          {meta ? ` / ${formatear(meta, 0)} g` : ' g'}
          {meta ? <span className={cx('ml-2', alto ? 'font-semibold text-exceso' : 'text-tinta-3')}>{formatear((pct ?? 0) * 100, 0)} %</span> : null}
        </span>
      </div>
      {barra}
    </div>
  );
}

/** Mini resumen de macros en línea (para filas de alimentos y resultados). */
export function MacrosEnLinea({ p, c, g, className }: { p?: number; c?: number; g?: number; className?: string }) {
  const f = (v?: number) => formatear(v, v !== undefined && v < 10 ? 1 : 0);
  const items = [{ l: 'P', v: p, fondo: 'bg-proteina', n: 'proteína' }, { l: 'C', v: c, fondo: 'bg-carbos', n: 'carbohidratos' }, { l: 'G', v: g, fondo: 'bg-grasa', n: 'grasa' }];
  return (
    <span className={cx('inline-flex gap-2.5 text-xs text-tinta-3 cifras', className)}>
      {items.map((i) => (
        <span key={i.l} className="inline-flex items-center gap-1" title={`${i.n}: ${f(i.v)} g`}>
          <span className={cx('size-1.5 rounded-full', i.fondo)} aria-hidden />
          <span className="font-semibold text-tinta-2">{i.l}</span>{f(i.v)}
        </span>
      ))}
    </span>
  );
}
