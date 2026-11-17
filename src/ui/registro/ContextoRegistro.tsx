import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { hoy } from '../../nucleo';
import type { ComidaId, RegistroComida } from '../../tipos';
import { COMIDAS } from '../../tipos';
import { Boton, Selector } from '../componentes/base';
import { Hoja } from '../componentes/Hoja';
import { useAvisos } from '../componentes/Avisos';
import * as datos from '../servicios/datos';
import { comidaPorHora, nombreComida } from '../util';
import { HojaRegistro } from './HojaRegistro';
import { PanelCantidad } from './PanelCantidad';
import type { Cantidad } from './PanelCantidad';

interface ContextoRegistro {
  abrirRegistro: (o?: { fecha?: string; comida?: ComidaId }) => void;
  editarRegistro: (r: RegistroComida) => void;
  /** Día que se está viendo (el botón flotante registra en ese día) */
  fechaVista: string;
  setFechaVista: (f: string) => void;
}

const Contexto = createContext<ContextoRegistro | null>(null);

export function useRegistro(): ContextoRegistro {
  const c = useContext(Contexto);
  if (!c) throw new Error('useRegistro fuera de ProveedorRegistro');
  return c;
}

export function ProveedorRegistro({ children }: { children: ReactNode }) {
  const [fechaVista, setFechaVista] = useState(hoy());
  const [registro, setRegistro] = useState<{ abierta: boolean; fecha: string; comida: ComidaId }>({ abierta: false, fecha: hoy(), comida: 'desayuno' });
  const [edicion, setEdicion] = useState<RegistroComida | null>(null);

  const abrirRegistro = useCallback((o: { fecha?: string; comida?: ComidaId } = {}) => {
    setRegistro({ abierta: true, fecha: o.fecha ?? fechaVista, comida: o.comida ?? comidaPorHora() });
  }, [fechaVista]);
  const cerrar = useCallback(() => setRegistro((r) => ({ ...r, abierta: false })), []);
  const editarRegistro = useCallback((r: RegistroComida) => setEdicion(r), []);
  const cerrarEdicion = useCallback(() => setEdicion(null), []);

  const valor = useMemo(() => ({ abrirRegistro, editarRegistro, fechaVista, setFechaVista }), [abrirRegistro, editarRegistro, fechaVista]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <HojaRegistro abierta={registro.abierta} onCerrar={cerrar} fecha={registro.fecha} comidaInicial={registro.comida} />
      {edicion && <HojaEditar registro={edicion} onCerrar={cerrarEdicion} />}
    </Contexto.Provider>
  );
}

function HojaEditar({ registro, onCerrar }: { registro: RegistroComida; onCerrar: () => void }) {
  const { avisar } = useAvisos();
  const [comida, setComida] = useState<ComidaId>(registro.comida);
  const [ocupado, setOcupado] = useState(false);

  const guardar = async (c: Cantidad) => {
    setOcupado(true);
    try {
      await datos.editarRegistro(registro.id, {
        cantidad: c.cantidad, unidad: c.unidad, porcionEtiqueta: c.porcionEtiqueta ?? null,
        ...(comida !== registro.comida ? { comida } : {}),
      });
      avisar({ texto: 'Cambios guardados', tono: 'exito' });
      onCerrar();
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo guardar.', tono: 'error' });
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    const quitado = await datos.eliminarRegistro(registro.id);
    onCerrar();
    if (quitado) {
      avisar({
        texto: `Eliminado de ${nombreComida(quitado.comida)}: ${quitado.instantanea.nombre}`,
        accion: { texto: 'Deshacer', alHacer: () => void datos.restaurarRegistro(quitado) },
      });
    }
  };

  return (
    <Hoja abierta onCerrar={onCerrar} titulo="Editar alimento" alto="auto">
      <PanelCantidad
        alimento={registro.instantanea}
        inicial={{ cantidad: registro.cantidad, unidad: registro.unidad, porcionEtiqueta: registro.porcionEtiqueta }}
        textoConfirmar="Guardar cambios"
        ocupado={ocupado}
        onConfirmar={guardar}
      >
        <div className="flex items-end gap-3">
          <Selector etiqueta="Comida" className="flex-1" value={comida} onChange={(e) => setComida(e.target.value as ComidaId)}>
            {COMIDAS.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
          <Boton variante="peligro" icono={Trash2} onClick={eliminar}>Eliminar</Boton>
        </div>
      </PanelCantidad>
    </Hoja>
  );
}
