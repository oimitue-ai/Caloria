/// <reference lib="webworker" />
/** Web Worker del catálogo base: índice en memoria fuera del hilo de la interfaz. */
import { NucleoBase, type InfoBase } from './base.ts';
import { crearCargadorHttp } from './red.ts';

let nucleo: NucleoBase | null = null;

type Mensaje =
  | { tipo: 'iniciar'; n: number; urlBase: string; version: string; info: InfoBase }
  | { tipo: 'buscar'; n: number; texto: string; limite: number; pagina: number }
  | { tipo: 'obtener'; n: number; id: string }
  | { tipo: 'precargar'; n: number };

self.onmessage = async (ev: MessageEvent<Mensaje>) => {
  const m = ev.data;
  try {
    let r: unknown;
    if (m.tipo === 'iniciar') {
      nucleo = new NucleoBase(crearCargadorHttp(m.urlBase, () => m.version), m.info);
      await nucleo.iniciar();
      r = nucleo.motor?.tamano ?? 0;
    } else if (!nucleo) throw new Error('catálogo no iniciado');
    else if (m.tipo === 'buscar') r = await nucleo.buscar(m.texto, m.limite, m.pagina);
    else if (m.tipo === 'obtener') r = await nucleo.obtener(m.id);
    else if (m.tipo === 'precargar') r = await nucleo.precargar();
    (self as unknown as Worker).postMessage({ n: m.n, ok: true, r });
  } catch (e) {
    (self as unknown as Worker).postMessage({ n: m.n, ok: false, error: String((e as Error)?.message ?? e), nombre: (e as Error)?.name });
  }
};
