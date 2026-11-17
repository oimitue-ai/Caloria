import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, ChartLine, Download, House, Menu, Plus, RefreshCw, Scale } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRegistro } from '../registro/ContextoRegistro';
import { usePwa } from '../pwa/ContextoPwa';
import { cx } from '../util';

const NAV: { a: string; texto: string; icono: LucideIcon; fin?: boolean }[] = [
  { a: '/', texto: 'Hoy', icono: House, fin: true },
  { a: '/calendario', texto: 'Calendario', icono: CalendarDays },
  { a: '/peso', texto: 'Peso', icono: Scale },
  { a: '/estadisticas', texto: 'Estadísticas', icono: ChartLine },
  { a: '/mas', texto: 'Más', icono: Menu },
];

/** Marca: la "C" de plato con el punto de cempasúchil, igual que el ícono de la app. */
export function Logo({ tam = 32 }: { tam?: number }) {
  return (
    <svg viewBox="0 0 512 512" width={tam} height={tam} aria-hidden className="shrink-0">
      <rect width="512" height="512" rx="116" fill="#2340B8" />
      <g transform="translate(256 256) scale(1.08) translate(-256 -256)">
        <path d="M347.9 333.1 A120 120 0 1 1 347.9 178.9" fill="none" stroke="#fff" strokeWidth="56" strokeLinecap="round" />
        <circle cx="384" cy="256" r="30" fill="#F2A93B" />
      </g>
    </svg>
  );
}

function BotonRegistrar({ escritorio }: { escritorio?: boolean }) {
  const { abrirRegistro } = useRegistro();
  if (escritorio) {
    return (
      <button type="button" onClick={() => abrirRegistro()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-talavera px-4 font-semibold text-sobre-talavera transition hover:bg-talavera-fuerte">
        <Plus aria-hidden size={20} strokeWidth={2.6} /> Registrar comida
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => abrirRegistro()}
      aria-label="Registrar comida"
      className="fixed right-4 z-30 flex size-15 items-center justify-center rounded-[1.25rem] bg-talavera text-sobre-talavera sombra-flotante transition active:scale-95 lg:hidden bottom-[calc(4.75rem+env(safe-area-inset-bottom))]"
    >
      <Plus aria-hidden size={28} strokeWidth={2.6} />
    </button>
  );
}

function AvisoActualizacion() {
  const { hayActualizacion, actualizar, descartarActualizacion } = usePwa();
  if (!hayActualizacion) return null;
  return (
    <div role="status" className="anim-aviso fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-tinta py-2 pl-4 pr-2 text-papel sombra-flotante lg:left-auto lg:right-6">
      <RefreshCw aria-hidden size={20} className="shrink-0" />
      <p className="flex-1 text-sm font-semibold">Nueva versión disponible</p>
      <button type="button" onClick={descartarActualizacion} className="min-h-11 rounded-xl px-3 text-sm opacity-80 hover:bg-white/10 dark:hover:bg-black/10">Después</button>
      <button type="button" onClick={actualizar} className="min-h-11 rounded-xl bg-papel px-3 text-sm font-bold text-tinta">Actualizar</button>
    </div>
  );
}

export function Marco({ children }: { children: ReactNode }) {
  const { puedeInstalar, instalar } = usePwa();
  const { pathname } = useLocation();
  const conBotonFlotante = pathname === '/' || pathname === '/calendario';

  return (
    <div className="min-h-dvh pl-seguro pr-seguro">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-control focus:bg-superficie focus:px-4 focus:py-3">
        Saltar al contenido
      </a>

      {/* Barra lateral (pantallas anchas) */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-borde bg-superficie px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo tam={34} />
          <span className="font-display text-[1.35rem] font-extrabold tracking-[-0.01em]">CALORÍA</span>
        </div>
        <BotonRegistrar escritorio />
        <nav aria-label="Navegación principal" className="mt-6 flex flex-col gap-1">
          {NAV.map(({ a, texto, icono: Icono, fin }) => (
            <NavLink key={a} to={a} end={fin}
              className={({ isActive }) => cx(
                'flex min-h-11 items-center gap-3 rounded-control px-3 font-semibold transition',
                isActive ? 'bg-talavera-tinte text-talavera' : 'text-tinta-2 hover:bg-hundido hover:text-tinta',
              )}>
              <Icono aria-hidden size={21} />{texto}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          {puedeInstalar && (
            <button type="button" onClick={() => void instalar()}
              className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 font-semibold text-tinta-2 hover:bg-hundido hover:text-tinta">
              <Download aria-hidden size={20} /> Instalar app
            </button>
          )}
          <p className="px-3 pt-3 text-xs text-tinta-3">Tus datos se guardan solo en este dispositivo.</p>
        </div>
      </aside>

      <main id="contenido" className={cx('pt-seguro lg:ml-64 lg:pb-12', conBotonFlotante ? 'pb-[calc(10rem+env(safe-area-inset-bottom))]' : 'pb-[calc(6rem+env(safe-area-inset-bottom))]')}>
        <div className="mx-auto w-full max-w-5xl lg:px-10">{children}</div>
      </main>

      {conBotonFlotante && <BotonRegistrar />}

      {/* Barra inferior (móvil) */}
      <nav aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie/95 pb-seguro backdrop-blur lg:hidden">
        <ul className="mx-auto flex max-w-lg">
          {NAV.map(({ a, texto, icono: Icono, fin }) => (
            <li key={a} className="flex-1">
              <NavLink to={a} end={fin}
                className={({ isActive }) => cx(
                  'flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.72rem] font-semibold transition',
                  isActive ? 'text-talavera' : 'text-tinta-3 hover:text-tinta',
                )}>
                {({ isActive }) => (
                  <>
                    <span className={cx('flex h-8 w-14 items-center justify-center rounded-full transition', isActive && 'bg-talavera-tinte')}>
                      <Icono aria-hidden size={22} strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    {texto}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <AvisoActualizacion />
    </div>
  );
}
