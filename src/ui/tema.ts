import { useCallback, useEffect } from 'react';
import type { Configuracion } from '../tipos';
import { guardarConfig, useConfig } from './servicios/datos';

export type Tema = Configuracion['tema'];
const CLAVE = 'caloria.tema';

function esOscuro(t: Tema): boolean {
  return t === 'oscuro' || (t === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

export function aplicarTema(t: Tema): void {
  const oscuro = esOscuro(t);
  document.documentElement.classList.toggle('dark', oscuro);
  const color = oscuro ? '#0c1221' : '#f3f5f9';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

export function temaGuardado(): Tema {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === 'claro' || t === 'oscuro' || t === 'sistema' ? t : 'sistema';
  } catch { return 'sistema'; }
}

/** Tema activo: la BD manda; localStorage es la copia rápida para pintar sin destello. */
export function useTema(): { tema: Tema; cambiarTema: (t: Tema) => void } {
  const config = useConfig();
  const tema = config?.tema ?? temaGuardado();

  useEffect(() => {
    aplicarTema(tema);
    try { localStorage.setItem(CLAVE, tema); } catch { /* modo privado */ }
    if (tema !== 'sistema') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => aplicarTema('sistema');
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [tema]);

  const cambiarTema = useCallback((t: Tema) => {
    aplicarTema(t);
    try { localStorage.setItem(CLAVE, t); } catch { /* modo privado */ }
    void guardarConfig({ tema: t });
  }, []);

  return { tema, cambiarTema };
}
