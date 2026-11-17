import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alimento, ResultadoBusqueda } from '../../tipos';
import { buscarEnCatalogo } from '../servicios/catalogo';
import { buscarAlimentosLocales } from '../servicios/datos';

export type EstadoBusqueda = 'inactivo' | 'buscando' | 'listo' | 'error';

const DEBOUNCE_MS = 120;
const LIMITE = 25;

/**
 * Búsqueda mientras se escribe: espera ~120 ms, cancela la consulta anterior (AbortSignal),
 * combina tus alimentos/recetas (arriba) con el catálogo y pagina con "mostrar más".
 * Si el catálogo falla, muestra lo disponible en el dispositivo (propios + ya usados).
 */
export function useBusqueda(opciones: { excluir?: (id: string) => boolean } = {}) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [locales, setLocales] = useState<Alimento[]>([]);
  const [estado, setEstado] = useState<EstadoBusqueda>('inactivo');
  const [parcial, setParcial] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [cargandoMas, setCargandoMas] = useState(false);
  const control = useRef<AbortController | null>(null);
  const excluir = useRef(opciones.excluir);
  excluir.current = opciones.excluir;

  useEffect(() => {
    control.current?.abort();
    const consulta = texto.trim();
    if (!consulta) {
      setResultados([]); setLocales([]); setEstado('inactivo'); setParcial(false); setHayMas(false);
      return;
    }
    const ctrl = new AbortController();
    control.current = ctrl;
    setEstado('buscando');
    const filtro = <T extends { id: string }>(l: T[]) => (excluir.current ? l.filter((x) => !excluir.current!(x.id)) : l);
    const t = window.setTimeout(async () => {
      const propiosP = buscarAlimentosLocales(consulta, { limite: 8, incluirCache: false }).catch(() => [] as Alimento[]);
      try {
        const [r, propios] = await Promise.all([
          buscarEnCatalogo(consulta, { limite: LIMITE, pagina: 0, senal: ctrl.signal }),
          propiosP,
        ]);
        if (ctrl.signal.aborted) return;
        const ids = new Set(propios.map((a) => a.id));
        setLocales(filtro(propios));
        setResultados(filtro(r.resultados.filter((x) => !ids.has(x.id))));
        setHayMas(r.hayMas);
        setPagina(0);
        setParcial(!!r.parcial);
        setEstado('listo');
      } catch (e) {
        if (ctrl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
        const respaldo = await buscarAlimentosLocales(consulta, { limite: LIMITE }).catch(() => [] as Alimento[]);
        if (ctrl.signal.aborted) return;
        setLocales(filtro(respaldo));
        setResultados([]);
        setHayMas(false);
        setParcial(true);
        setEstado('error');
      }
    }, DEBOUNCE_MS);
    return () => { window.clearTimeout(t); ctrl.abort(); };
  }, [texto]);

  const cargarMas = useCallback(async () => {
    setCargandoMas(true);
    try {
      const r = await buscarEnCatalogo(texto.trim(), { limite: LIMITE, pagina: pagina + 1 });
      setResultados((prev) => {
        const ids = new Set([...prev.map((x) => x.id), ...locales.map((x) => x.id)]);
        const nuevos = r.resultados.filter((x) => !ids.has(x.id) && !excluir.current?.(x.id));
        return [...prev, ...nuevos];
      });
      setHayMas(r.hayMas);
      setPagina((p) => p + 1);
      if (r.parcial) setParcial(true);
    } catch { /* se conserva lo que ya hay */ }
    setCargandoMas(false);
  }, [texto, pagina, locales]);

  return {
    texto,
    setTexto,
    estado,
    /** Props listas para <ResultadosBusqueda> */
    vista: { estado, locales, resultados, parcial, hayMas, cargandoMas, onMas: cargarMas },
  };
}
