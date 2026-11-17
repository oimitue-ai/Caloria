import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface ContextoPwa {
  /** El navegador ofreció instalar (beforeinstallprompt) */
  puedeInstalar: boolean;
  instalar: () => Promise<boolean>;
  /** Ya corre como app instalada */
  instalada: boolean;
  /** iOS/iPadOS Safari: se instala desde Compartir → Agregar a inicio */
  esIOS: boolean;
  hayActualizacion: boolean;
  actualizar: () => void;
  descartarActualizacion: () => void;
  listaSinConexion: boolean;
}

const Contexto = createContext<ContextoPwa | null>(null);

export function usePwa(): ContextoPwa {
  const c = useContext(Contexto);
  if (!c) throw new Error('usePwa fuera de ProveedorPwa');
  return c;
}

function detectarIOS(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function enModoApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function ProveedorPwa({ children }: { children: ReactNode }) {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);
  const [instalada, setInstalada] = useState(enModoApp);

  const { needRefresh: [hayActualizacion, setHayActualizacion], offlineReady: [listaSinConexion], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registro) {
      // Busca versiones nuevas cada hora mientras la app esté abierta.
      if (registro) window.setInterval(() => { void registro.update().catch(() => undefined); }, 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    const antes = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalacion); };
    const despues = () => { setEvento(null); setInstalada(true); };
    window.addEventListener('beforeinstallprompt', antes);
    window.addEventListener('appinstalled', despues);
    const mq = window.matchMedia('(display-mode: standalone)');
    const cambio = () => setInstalada(enModoApp());
    mq.addEventListener('change', cambio);
    return () => {
      window.removeEventListener('beforeinstallprompt', antes);
      window.removeEventListener('appinstalled', despues);
      mq.removeEventListener('change', cambio);
    };
  }, []);

  const instalar = useCallback(async () => {
    if (!evento) return false;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    setEvento(null);
    return outcome === 'accepted';
  }, [evento]);

  const valor = useMemo<ContextoPwa>(() => ({
    puedeInstalar: !!evento && !instalada,
    instalar,
    instalada,
    esIOS: detectarIOS(),
    hayActualizacion,
    actualizar: () => { void updateServiceWorker(true); },
    descartarActualizacion: () => setHayActualizacion(false),
    listaSinConexion,
  }), [evento, instalada, instalar, hayActualizacion, updateServiceWorker, setHayActualizacion, listaSinConexion]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
