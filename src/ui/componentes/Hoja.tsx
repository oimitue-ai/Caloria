import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../util';
import { BotonIcono } from './base';

/**
 * Pila de capas abiertas (hojas y diálogos). Cada capa agrega una entrada al historial para
 * que el botón "atrás" de Android la cierre en lugar de salir de la app.
 */
const pila: { id: string; cerrar: () => void }[] = [];
let escuchando = false;
let ignorarPop = 0;

function alPop() {
  if (ignorarPop > 0) { ignorarPop--; return; }
  const capa = pila.pop();
  capa?.cerrar();
}

let capasAbiertas = 0;

/** Mientras haya una capa abierta, el resto de la app queda inerte (ni foco ni lector de pantalla). */
function marcarInerte(delta: number) {
  capasAbiertas = Math.max(0, capasAbiertas + delta);
  const raiz = document.getElementById('root');
  if (!raiz) return;
  if (capasAbiertas > 0) raiz.setAttribute('inert', '');
  else raiz.removeAttribute('inert');
}

export function useBotonAtras(abierta: boolean, onCerrar: () => void): void {
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const id = useId();
  useEffect(() => {
    if (!abierta) return;
    marcarInerte(1);
    if (!escuchando) { window.addEventListener('popstate', alPop); escuchando = true; }
    pila.push({ id, cerrar: () => cerrarRef.current() });
    // Conserva el estado del enrutador (idx/key) para que no detecte una navegación.
    window.history.pushState({ ...(window.history.state ?? {}), capaCaloria: id }, '');
    return () => {
      marcarInerte(-1);
      const i = pila.findIndex((c) => c.id === id);
      if (i >= 0) {
        // Se cerró desde la interfaz: retira la entrada del historial que agregamos.
        pila.splice(i, 1);
        if (window.history.state?.capaCaloria === id) { ignorarPop++; window.history.back(); }
      }
    };
  }, [abierta, id]);
}

function useAtraparFoco(abierta: boolean, contenedor: RefObject<HTMLElement | null>, inicial?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!abierta) return;
    const previo = document.activeElement as HTMLElement | null;
    const el = contenedor.current;
    const t = window.setTimeout(() => {
      const objetivo = inicial?.current ?? el?.querySelector<HTMLElement>('[data-autofoco]') ?? el;
      objetivo?.focus({ preventScroll: true });
    }, 30);
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el) return;
      const enfocables = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')]
        .filter((n) => n.offsetParent !== null);
      if (!enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', alTeclear);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflow;
      previo?.focus?.({ preventScroll: true });
    };
  }, [abierta, contenedor, inicial]);
}

interface PropsHoja {
  abierta: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  /** Texto accesible si `titulo` no es texto plano */
  etiqueta?: string;
  children: ReactNode;
  pie?: ReactNode;
  /** 'completa' ocupa casi toda la altura (buscador); 'auto' se ajusta al contenido */
  alto?: 'auto' | 'completa';
  focoInicial?: RefObject<HTMLElement | null>;
  encabezadoExtra?: ReactNode;
  accionIzquierda?: ReactNode;
}

/** Hoja inferior en móvil; diálogo centrado en pantallas anchas. */
export function Hoja({ abierta, onCerrar, titulo, etiqueta, children, pie, alto = 'auto', focoInicial, encabezadoExtra, accionIzquierda }: PropsHoja) {
  const ref = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  useBotonAtras(abierta, onCerrar);
  useAtraparFoco(abierta, ref, focoInicial);

  useEffect(() => {
    if (!abierta) return;
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pila[pila.length - 1] && ref.current?.contains(document.activeElement)) {
        e.stopPropagation();
        onCerrar();
      }
    };
    document.addEventListener('keydown', alEscape);
    return () => document.removeEventListener('keydown', alEscape);
  }, [abierta, onCerrar]);

  if (!abierta) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6">
      <div className="anim-velo absolute inset-0 bg-[#0a1020]/45 backdrop-blur-[2px]" onClick={onCerrar} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={etiqueta ? undefined : idTitulo}
        aria-label={etiqueta}
        tabIndex={-1}
        className={cx(
          'anim-hoja relative flex w-full flex-col bg-superficie outline-none',
          'rounded-t-hoja lg:max-w-xl lg:rounded-hoja lg:anim-dialogo',
          alto === 'completa' ? 'h-[92dvh] lg:h-[min(46rem,88dvh)]' : 'max-h-[92dvh] lg:max-h-[88dvh]',
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-borde lg:hidden" aria-hidden />
        <div className="flex shrink-0 items-center gap-1 px-2 pb-1 pt-1 lg:pt-3">
          {accionIzquierda ?? <span className="w-2" />}
          <h2 id={idTitulo} className="min-w-0 flex-1 truncate px-1 text-lg font-semibold">{titulo}</h2>
          <BotonIcono icono={X} etiqueta="Cerrar" onClick={onCerrar} />
        </div>
        {encabezadoExtra}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {pie && <div className="shrink-0 border-t border-borde px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">{pie}</div>}
        {!pie && <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body,
  );
}
