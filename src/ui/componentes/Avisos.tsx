import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { Boton, BotonIcono } from './base';
import { useBotonAtras } from './Hoja';
import { cx } from '../util';

interface Aviso {
  id: number;
  texto: string;
  tono?: 'exito' | 'error' | 'neutro';
  accion?: { texto: string; alHacer: () => void };
  duracion?: number;
}

interface PeticionConfirmar {
  titulo: string;
  texto?: ReactNode;
  confirmar?: string;
  cancelar?: string;
  peligro?: boolean;
}

interface ContextoAvisos {
  avisar: (a: Omit<Aviso, 'id'>) => void;
  confirmar: (p: PeticionConfirmar) => Promise<boolean>;
}

const Contexto = createContext<ContextoAvisos | null>(null);

export function useAvisos(): ContextoAvisos {
  const c = useContext(Contexto);
  if (!c) throw new Error('useAvisos fuera de ProveedorAvisos');
  return c;
}

let siguiente = 1;

/** Errores del navegador (IndexedDB, red) que llegan en inglés → mensaje en español accionable. */
// eslint-disable-next-line react-refresh/only-export-components
export function traducirErrorTecnico(texto: string): string {
  if (/QuotaExceeded|quota|exceeded the quota/i.test(texto))
    return 'El almacenamiento del dispositivo está lleno. Libera espacio o exporta un respaldo y borra datos antiguos.';
  if (/InvalidStateError|database.*(closed|blocked)|VersionError/i.test(texto))
    return 'La base de datos está bloqueada por otra pestaña de CALORÍA. Cierra las demás pestañas y vuelve a intentar.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(texto))
    return 'Sin conexión: no se pudo descargar la información. Revisa tu internet.';
  return texto;
}

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [peticion, setPeticion] = useState<(PeticionConfirmar & { resolver: (v: boolean) => void }) | null>(null);
  const temporizador = useRef<number | undefined>(undefined);

  const avisar = useCallback((a: Omit<Aviso, 'id'>) => {
    window.clearTimeout(temporizador.current);
    const nuevo = { ...a, texto: traducirErrorTecnico(a.texto), id: siguiente++ };
    setAviso(nuevo);
    temporizador.current = window.setTimeout(() => setAviso((x) => (x?.id === nuevo.id ? null : x)), a.duracion ?? (a.accion ? 5000 : 2600));
  }, []);

  const confirmar = useCallback((p: PeticionConfirmar) => new Promise<boolean>((resolver) => {
    setPeticion({ ...p, resolver });
  }), []);

  const valor = useMemo(() => ({ avisar, confirmar }), [avisar, confirmar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-3 bottom-[calc(9.75rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-64"
        >
          {aviso && (
            <div
              key={aviso.id}
              role="status"
              className={cx(
                'anim-aviso pointer-events-auto flex min-h-12 w-full max-w-md items-center gap-3 rounded-2xl py-1.5 pl-4 pr-1.5 sombra-flotante',
                'bg-tinta text-papel',
              )}
            >
              {aviso.tono === 'error'
                ? <CircleAlert aria-hidden size={20} className="shrink-0 text-[#ff9b85] dark:text-exceso" />
                : <CircleCheck aria-hidden size={20} className="shrink-0 text-[#9fe0b8] dark:text-exito" />}
              <span className="min-w-0 flex-1 py-2 text-[0.95rem] font-semibold">{aviso.texto}</span>
              {aviso.accion && (
                <button
                  type="button"
                  className="min-h-11 rounded-xl px-3 font-bold text-[#b9c6ff] hover:bg-white/10 dark:text-talavera dark:hover:bg-black/10"
                  onClick={() => { aviso.accion!.alHacer(); setAviso(null); }}
                >
                  {aviso.accion.texto}
                </button>
              )}
              <button type="button" aria-label="Cerrar aviso" onClick={() => setAviso(null)}
                className="flex size-11 items-center justify-center rounded-xl opacity-70 hover:bg-white/10 hover:opacity-100 dark:hover:bg-black/10">
                <X aria-hidden size={18} />
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
      {peticion && (
        <DialogoConfirmar
          peticion={peticion}
          responder={(v) => { peticion.resolver(v); setPeticion(null); }}
        />
      )}
    </Contexto.Provider>
  );
}

function DialogoConfirmar({ peticion, responder }: { peticion: PeticionConfirmar; responder: (v: boolean) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useBotonAtras(true, () => responder(false));
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') responder(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [responder]);
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center">
      <div className="anim-velo absolute inset-0 bg-[#0a1020]/50" onClick={() => responder(false)} aria-hidden />
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo"
        className="anim-dialogo relative w-full max-w-sm rounded-hoja bg-superficie p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-2">
          <h2 id="confirmar-titulo" className="text-xl font-semibold">{peticion.titulo}</h2>
          <BotonIcono icono={X} etiqueta="Cancelar" onClick={() => responder(false)} className="-mr-2 -mt-2" />
        </div>
        {peticion.texto && <div className="mt-2 text-tinta-2">{peticion.texto}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="fantasma" onClick={() => responder(false)}>{peticion.cancelar ?? 'Cancelar'}</Boton>
          <Boton ref={ref} variante={peticion.peligro ? 'peligro' : 'primario'} onClick={() => responder(true)}>
            {peticion.confirmar ?? 'Aceptar'}
          </Boton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
