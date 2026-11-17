import { forwardRef, useId } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cx } from '../util';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-talavera text-sobre-talavera hover:bg-talavera-fuerte active:scale-[0.98]',
  secundario: 'bg-talavera-tinte text-talavera hover:brightness-95 dark:hover:brightness-125',
  fantasma: 'text-tinta-2 hover:bg-hundido hover:text-tinta',
  peligro: 'bg-exceso-tinte text-exceso hover:brightness-95 dark:hover:brightness-125',
};

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  icono?: LucideIcon;
  ancho?: boolean;
  chico?: boolean;
}

export const Boton = forwardRef<HTMLButtonElement, PropsBoton>(function Boton(
  { variante = 'primario', icono: Icono, ancho, chico, className, children, type = 'button', ...resto }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition select-none',
        'disabled:opacity-45 disabled:pointer-events-none',
        chico ? 'min-h-10 px-3 text-sm' : 'min-h-12 px-5',
        ancho && 'w-full',
        VARIANTES[variante],
        className,
      )}
      {...resto}
    >
      {Icono && <Icono aria-hidden size={chico ? 18 : 20} strokeWidth={2.2} />}
      {children}
    </button>
  );
});

interface PropsBotonIcono extends ButtonHTMLAttributes<HTMLButtonElement> {
  icono: LucideIcon;
  etiqueta: string;
  tono?: 'neutro' | 'talavera' | 'peligro';
  tam?: number;
}

export const BotonIcono = forwardRef<HTMLButtonElement, PropsBotonIcono>(function BotonIcono(
  { icono: Icono, etiqueta, tono = 'neutro', tam = 22, className, type = 'button', ...resto }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={etiqueta}
      title={etiqueta}
      className={cx(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full transition',
        'disabled:opacity-40 disabled:pointer-events-none',
        tono === 'neutro' && 'text-tinta-2 hover:bg-hundido hover:text-tinta',
        tono === 'talavera' && 'text-talavera hover:bg-talavera-tinte',
        tono === 'peligro' && 'text-exceso hover:bg-exceso-tinte',
        className,
      )}
      {...resto}
    >
      <Icono aria-hidden size={tam} strokeWidth={2.1} />
    </button>
  );
});

const claseControl = cx(
  'w-full min-h-12 rounded-control border border-borde bg-superficie px-3.5 text-tinta',
  'placeholder:text-tinta-3 focus:border-talavera focus:outline-none focus:ring-2 focus:ring-talavera/30',
  'aria-[invalid=true]:border-exceso',
);

interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string;
  ayuda?: ReactNode;
  error?: string;
  sufijo?: string;
  ocultarEtiqueta?: boolean;
}

export const Campo = forwardRef<HTMLInputElement, PropsCampo>(function Campo(
  { etiqueta, ayuda, error, sufijo, ocultarEtiqueta, className, id, ...resto }, ref,
) {
  const generado = useId();
  const idCampo = id ?? generado;
  return (
    <div className={className}>
      <label htmlFor={idCampo} className={cx('mb-1.5 block text-sm font-semibold text-tinta-2', ocultarEtiqueta && 'sr-only')}>
        {etiqueta}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={idCampo}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || ayuda ? `${idCampo}-ayuda` : undefined}
          className={cx(claseControl, sufijo && 'pr-14', 'cifras')}
          {...resto}
        />
        {sufijo && (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-tinta-3">{sufijo}</span>
        )}
      </div>
      {(error || ayuda) && (
        <p id={`${idCampo}-ayuda`} className={cx('mt-1.5 text-sm', error ? 'text-exceso' : 'text-tinta-3')}>
          {error ?? ayuda}
        </p>
      )}
    </div>
  );
});

interface PropsSelector extends SelectHTMLAttributes<HTMLSelectElement> {
  etiqueta: string;
  ocultarEtiqueta?: boolean;
  ayuda?: ReactNode;
}

export function Selector({ etiqueta, ocultarEtiqueta, ayuda, className, id, children, ...resto }: PropsSelector) {
  const generado = useId();
  const idCampo = id ?? generado;
  return (
    <div className={className}>
      <label htmlFor={idCampo} className={cx('mb-1.5 block text-sm font-semibold text-tinta-2', ocultarEtiqueta && 'sr-only')}>
        {etiqueta}
      </label>
      <select id={idCampo} className={cx(claseControl, 'appearance-none bg-[length:20px] bg-[right_0.75rem_center] bg-no-repeat pr-10')}
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7591%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")' }}
        {...resto}>
        {children}
      </select>
      {ayuda && <p className="mt-1.5 text-sm text-tinta-3">{ayuda}</p>}
    </div>
  );
}

interface PropsAreaTexto extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  etiqueta: string;
}

export function AreaTexto({ etiqueta, id, className, ...resto }: PropsAreaTexto) {
  const generado = useId();
  const idCampo = id ?? generado;
  return (
    <div className={className}>
      <label htmlFor={idCampo} className="mb-1.5 block text-sm font-semibold text-tinta-2">{etiqueta}</label>
      <textarea id={idCampo} rows={3} className={cx(claseControl, 'py-3')} {...resto} />
    </div>
  );
}

interface OpcionSegmentada<T extends string> { valor: T; texto: string }

/** Control segmentado (radiogroup) — para elecciones cortas y excluyentes. */
export function Segmentado<T extends string>({ etiqueta, opciones, valor, onCambio, className }: {
  etiqueta: string;
  opciones: OpcionSegmentada<T>[];
  valor: T | undefined;
  onCambio: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className={cx('flex gap-1 rounded-control bg-hundido p-1', className)}>
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(o.valor)}
            className={cx(
              'min-h-10 flex-1 rounded-[0.55rem] px-2 text-sm font-semibold transition',
              activo ? 'bg-superficie text-tinta shadow-sm' : 'text-tinta-2 hover:text-tinta',
            )}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

/** Superficie elevada básica. `plana` quita el borde para anidar. */
export function Tarjeta({ children, className, as: Etiqueta = 'section', ...resto }: {
  children: ReactNode; className?: string; as?: 'section' | 'div' | 'article'; 'aria-labelledby'?: string; 'aria-label'?: string;
}) {
  return (
    <Etiqueta className={cx('rounded-tarjeta bg-superficie border border-borde/70', className)} {...resto}>
      {children}
    </Etiqueta>
  );
}

/** Encabezado de pantalla: título grande a la izquierda y acciones a la derecha. */
export function Encabezado({ titulo, subtitulo, acciones, volver }: {
  titulo: string; subtitulo?: ReactNode; acciones?: ReactNode; volver?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-2 px-4 pb-3 pt-4 lg:px-0 lg:pt-8">
      {volver}
      <div className="min-w-0 flex-1">
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.02em] lg:text-[2.1rem]">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-tinta-2">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-1">{acciones}</div>}
    </header>
  );
}

/** Estado vacío: dice qué hacer a continuación. */
export function Vacio({ icono: Icono, titulo, texto, accion }: {
  icono: LucideIcon; titulo: string; texto?: ReactNode; accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex size-14 items-center justify-center rounded-full bg-talavera-tinte text-talavera">
        <Icono aria-hidden size={26} />
      </div>
      <p className="font-display text-lg font-semibold">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-tinta-2">{texto}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

/** Nota informativa (no alarmista). */
export function Nota({ children, tono = 'info', icono: Icono, className }: {
  children: ReactNode; tono?: 'info' | 'aviso' | 'exito'; icono?: LucideIcon; className?: string;
}) {
  return (
    <div
      className={cx(
        'flex gap-3 rounded-control px-3.5 py-3 text-sm leading-relaxed',
        tono === 'info' && 'bg-talavera-tinte text-tinta',
        tono === 'aviso' && 'bg-cempasuchil-tinte text-tinta',
        tono === 'exito' && 'bg-exito-tinte text-tinta',
        className,
      )}
    >
      {Icono && <Icono aria-hidden size={18} className={cx('mt-0.5 shrink-0', tono === 'aviso' ? 'text-cempasuchil-texto' : tono === 'exito' ? 'text-exito' : 'text-talavera')} />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-12 text-tinta-3">
      <span className="size-5 animate-spin rounded-full border-2 border-borde border-t-talavera" aria-hidden />
      {texto}
    </div>
  );
}

/** Botón de regreso para subpantallas. */
export function Volver({ a, texto = 'Volver' }: { a: string; texto?: string }) {
  return (
    <Link to={a} aria-label={texto} title={texto}
      className="-ml-2 mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full text-tinta-2 hover:bg-hundido hover:text-tinta lg:mt-1.5">
      <ArrowLeft aria-hidden size={22} />
    </Link>
  );
}
