import { useRef, useState } from 'react';
import { ArrowLeft, LoaderCircle, Search, WifiOff, X } from 'lucide-react';
import { crearIngrediente } from '../../nucleo';
import type { Alimento, IngredienteReceta } from '../../tipos';
import { BotonIcono, Nota } from '../componentes/base';
import { Hoja } from '../componentes/Hoja';
import { useAvisos } from '../componentes/Avisos';
import { obtenerAlimento } from '../servicios/datos';
import { PanelCantidad } from './PanelCantidad';
import { ResultadosBusqueda } from './Resultados';
import { useBusqueda } from './useBusqueda';

/** El mismo buscador del registro, para agregar ingredientes a una receta. */
export function HojaIngrediente({ abierta, onCerrar, onAgregar, excluirId }: {
  abierta: boolean;
  onCerrar: () => void;
  onAgregar: (i: IngredienteReceta) => void;
  /** id `receta:<id>` de la receta que se edita (no puede contenerse a sí misma) */
  excluirId?: string;
}) {
  const { avisar } = useAvisos();
  const busqueda = useBusqueda({ excluir: (id) => id === excluirId });
  const [sel, setSel] = useState<{ id: string; alimento: Alimento | null; cargando: boolean } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const elegir = async (id: string, a?: Alimento) => {
    if (a) { setSel({ id, alimento: a, cargando: false }); return; }
    setSel({ id, alimento: null, cargando: true });
    const r = await obtenerAlimento(id);
    setSel((s) => (s?.id === id ? { id, alimento: r, cargando: false } : s));
  };
  const volver = () => { setSel(null); window.setTimeout(() => entrada.current?.focus(), 30); };

  return (
    <Hoja
      abierta={abierta}
      onCerrar={() => { setSel(null); busqueda.setTexto(''); onCerrar(); }}
      titulo={sel ? 'Cantidad del ingrediente' : 'Agregar ingrediente'}
      alto="completa"
      focoInicial={sel ? undefined : entrada}
      accionIzquierda={sel ? <BotonIcono icono={ArrowLeft} etiqueta="Volver a la búsqueda" onClick={volver} /> : undefined}
      encabezadoExtra={!sel && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1 rounded-control border border-borde bg-hundido pl-3 focus-within:border-talavera focus-within:bg-superficie focus-within:ring-2 focus-within:ring-talavera/30">
            <Search aria-hidden size={20} className="shrink-0 text-tinta-3" />
            <input ref={entrada} type="search" aria-label="Buscar ingrediente" placeholder="Busca un ingrediente" autoComplete="off" spellCheck={false}
              value={busqueda.texto} onChange={(e) => busqueda.setTexto(e.target.value)}
              className="min-h-12 w-full min-w-0 bg-transparent px-1 text-[1.05rem] placeholder:text-tinta-3 focus:outline-none [&::-webkit-search-cancel-button]:hidden" />
            {busqueda.estado === 'buscando' && <LoaderCircle aria-label="Buscando" size={18} className="shrink-0 animate-spin text-tinta-3" />}
            {busqueda.texto && <BotonIcono icono={X} etiqueta="Borrar búsqueda" tam={18} onClick={() => busqueda.setTexto('')} />}
          </div>
        </div>
      )}
    >
      {sel ? (
        sel.cargando ? (
          <div role="status" className="flex items-center justify-center gap-3 py-16 text-tinta-3"><LoaderCircle aria-hidden className="animate-spin" /> Cargando…</div>
        ) : sel.alimento ? (
          <PanelCantidad
            key={sel.id}
            alimento={sel.alimento}
            textoConfirmar="Agregar a la receta"
            onConfirmar={(c) => {
              const r = crearIngrediente(sel.alimento!, c.cantidad, c.unidad, c.porcionEtiqueta);
              if (!r.ok) { avisar({ texto: r.motivo, tono: 'error' }); return; }
              onAgregar(r.ingrediente);
              avisar({ texto: `Ingrediente agregado: ${sel.alimento!.nombre}`, tono: 'exito' });
              busqueda.setTexto('');
              volver();
            }}
          />
        ) : <div className="p-4"><Nota tono="aviso" icono={WifiOff}>No se pudo cargar este alimento. Revisa tu conexión.</Nota></div>
      ) : busqueda.texto.trim() ? (
        <ResultadosBusqueda {...busqueda.vista} texto={busqueda.texto.trim()} onElegir={elegir} onCerrar={onCerrar} />
      ) : (
        <p className="px-8 py-10 text-center text-tinta-2">Escribe el nombre de un ingrediente, por ejemplo “maíz pozolero” o “carne de cerdo”.</p>
      )}
    </Hoja>
  );
}
