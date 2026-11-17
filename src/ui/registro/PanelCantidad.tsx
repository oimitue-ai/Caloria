import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Info, Minus, Plus } from 'lucide-react';
import {
  calcularTotales, convertirABase, formatear, unidadesDisponibles, unidadPredeterminada,
} from '../../nucleo';
import type { OpcionUnidad } from '../../nucleo';
import type { Alimento, UnidadId } from '../../tipos';
import { Boton, Nota, Selector } from '../componentes/base';
import { InsigniaFuente } from '../componentes/Insignias';
import { MACROS } from '../componentes/Medidores';
import { cx, leerNumero } from '../util';

/** Lo mínimo que necesita el panel: una instantánea o un alimento completo. */
export type AlimentoParaCantidad = Pick<Alimento, 'nombre' | 'marca' | 'fuente' | 'base' | 'nutrientes' | 'densidad' | 'porciones' | 'soloPorciones'>
  & Partial<Pick<Alimento, 'validacion' | 'notas' | 'nombreTraducido' | 'nombreOriginal'>>;

export interface Cantidad { cantidad: number; unidad: UnidadId; porcionEtiqueta?: string }

const claveOpcion = (o: { unidad: UnidadId; porcionEtiqueta?: string }) => `${o.unidad}|${o.porcionEtiqueta ?? ''}`;
const esAbsoluta = (u: UnidadId) => u === 'g' || u === 'ml';

export function PanelCantidad({ alimento, inicial, textoConfirmar, onConfirmar, accesorios, ocupado, children }: {
  alimento: AlimentoParaCantidad;
  children?: ReactNode;
  inicial?: Cantidad;
  textoConfirmar: string;
  onConfirmar: (c: Cantidad & { cantidadBase: number }) => void;
  accesorios?: ReactNode;
  ocupado?: boolean;
}) {
  const opciones = useMemo(() => unidadesDisponibles(alimento), [alimento]);
  const opcionInicial = useMemo<OpcionUnidad | undefined>(() => {
    if (inicial) {
      return opciones.find((o) => claveOpcion(o) === claveOpcion(inicial))
        ?? opciones.find((o) => o.unidad === inicial.unidad && !o.porcionEtiqueta)
        ?? unidadPredeterminada(alimento);
    }
    return unidadPredeterminada(alimento);
  }, [alimento, inicial, opciones]);

  const [clave, setClave] = useState(opcionInicial ? claveOpcion(opcionInicial) : '');
  const opcion = opciones.find((o) => claveOpcion(o) === clave);
  const cantidadInicial = inicial?.cantidad ?? (opcion && esAbsoluta(opcion.unidad) ? 100 : 1);
  const [texto, setTexto] = useState(String(cantidadInicial));
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // En móvil no abrimos el teclado de golpe: el valor sugerido suele bastar.
    if (window.matchMedia('(pointer: fine)').matches) entrada.current?.select();
  }, []);

  const cantidad = leerNumero(texto);
  const conversion = opcion && cantidad !== undefined
    ? convertirABase(alimento, cantidad, opcion.unidad, opcion.porcionEtiqueta)
    : null;
  const totales = conversion?.ok ? calcularTotales(alimento.nutrientes, conversion.cantidadBase) : null;

  const cambiarUnidad = (nueva: string) => {
    const o = opciones.find((x) => claveOpcion(x) === nueva);
    setClave(nueva);
    if (o) setTexto(esAbsoluta(o.unidad) ? '100' : o.unidad === 'kg' || o.unidad === 'l' ? '0.1' : '1');
  };

  const rapidos: { texto: string; valor: number }[] = opcion && esAbsoluta(opcion.unidad)
    ? [50, 100, 150, 200].map((v) => ({ texto: String(v), valor: v }))
    : [{ texto: '½', valor: 0.5 }, { texto: '1', valor: 1 }, { texto: '1½', valor: 1.5 }, { texto: '2', valor: 2 }];
  const paso = opcion && esAbsoluta(opcion.unidad) ? 10 : opcion?.unidad === 'kg' || opcion?.unidad === 'l' ? 0.1 : 0.5;
  const ajustar = (delta: number) => {
    const actual = cantidad ?? 0;
    const nuevo = Math.max(0, Math.round((actual + delta) * 100) / 100);
    setTexto(String(nuevo));
  };

  const confirmar = () => {
    if (!opcion || !conversion?.ok || cantidad === undefined) return;
    onConfirmar({ cantidad, unidad: opcion.unidad, porcionEtiqueta: opcion.porcionEtiqueta, cantidadBase: conversion.cantidadBase });
  };

  const sinDatos = alimento.nutrientes.kcal === undefined;

  return (
    <form className="flex h-full flex-col" onSubmit={(e) => { e.preventDefault(); confirmar(); }}>
      <div className="flex-1 space-y-5 px-4 pb-4">
        <div>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl font-semibold leading-snug">{alimento.nombre}</p>
              {alimento.marca && <p className="text-tinta-2">{alimento.marca}</p>}
            </div>
            {accesorios}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-tinta-3">
            {alimento.validacion && <InsigniaFuente fuente={alimento.fuente} validacion={alimento.validacion} conFuente />}
            <span className="cifras">{formatear(alimento.nutrientes.kcal, 0)} kcal por 100 {alimento.base}</span>
          </div>
          {alimento.nombreTraducido && alimento.nombreOriginal && (
            <p className="mt-1.5 text-sm text-tinta-3">Nombre original: {alimento.nombreOriginal}</p>
          )}
        </div>

        {sinDatos && (
          <Nota tono="aviso" icono={Info}>La fuente no informa las calorías de este alimento; se contará como 0 kcal.</Nota>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-3">
          <div>
            <label htmlFor="cantidad-registro" className="mb-1.5 block text-sm font-semibold text-tinta-2">Cantidad</label>
            <div className="flex items-stretch rounded-control border border-borde bg-superficie focus-within:border-talavera focus-within:ring-2 focus-within:ring-talavera/30">
              <button type="button" aria-label="Disminuir" onClick={() => ajustar(-paso)} className="flex w-11 shrink-0 items-center justify-center text-tinta-2 hover:text-tinta">
                <Minus aria-hidden size={18} />
              </button>
              <input
                ref={entrada}
                id="cantidad-registro"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                aria-invalid={conversion !== null && !conversion.ok ? true : undefined}
                className="min-h-12 w-full min-w-0 bg-transparent text-center font-display text-xl font-semibold cifras focus:outline-none"
              />
              <button type="button" aria-label="Aumentar" onClick={() => ajustar(paso)} className="flex w-11 shrink-0 items-center justify-center text-tinta-2 hover:text-tinta">
                <Plus aria-hidden size={18} />
              </button>
            </div>
          </div>
          <Selector etiqueta="Unidad" value={clave} onChange={(e) => cambiarUnidad(e.target.value)}>
            {opciones.map((o) => (
              <option key={claveOpcion(o)} value={claveOpcion(o)}>
                {o.porcionEtiqueta && !/\d\s*(g|ml)\b/.test(o.etiqueta) ? `${o.etiqueta} (${formatear(o.equivalencia, 0)} ${alimento.base})` : o.etiqueta}
              </option>
            ))}
          </Selector>
        </div>

        <div className="flex gap-2" role="group" aria-label="Cantidades rápidas">
          {rapidos.map((r) => (
            <button
              key={r.texto}
              type="button"
              onClick={() => setTexto(String(r.valor))}
              aria-pressed={cantidad === r.valor}
              className={cx(
                'min-h-11 flex-1 rounded-full border text-base font-semibold transition cifras',
                cantidad === r.valor ? 'border-talavera bg-talavera-tinte text-talavera' : 'border-borde text-tinta-2 hover:border-tinta-3',
              )}
            >
              {r.texto}
            </button>
          ))}
        </div>

        {conversion && !conversion.ok && <p role="alert" className="text-sm text-exceso">{conversion.motivo}</p>}

        <div className="rounded-tarjeta bg-hundido p-4" aria-live="polite">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-tinta-2">Vas a agregar</p>
              <p className="font-display text-[2.4rem] font-bold leading-none tracking-[-0.03em] cifras">
                {totales ? formatear(totales.kcal, 0) : '—'}<span className="ml-1.5 text-lg font-semibold text-tinta-2">kcal</span>
              </p>
            </div>
            {conversion?.ok && !alimento.soloPorciones && (
              <p className="pb-1 text-sm text-tinta-3 cifras">{formatear(conversion.cantidadBase, 0)} {alimento.base}</p>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {MACROS.map((m) => (
              <div key={m.id} className="rounded-control bg-superficie px-3 py-2">
                <dt className="flex items-center gap-1.5 text-xs font-semibold text-tinta-2">
                  <span className={cx('size-2 shrink-0 rounded-full', m.fondo)} aria-hidden /><span className="truncate">{m.nombre}</span>
                </dt>
                <dd className="mt-0.5 font-semibold cifras">
                  {totales ? (totales.faltantes.includes(m.id) ? '—' : `${formatear(totales[m.id], 1)} g`) : '—'}
                </dd>
              </div>
            ))}
          </dl>
          {totales && totales.faltantes.length > 0 && (
            <p className="mt-2 text-xs text-tinta-3">— = la fuente no informa ese dato.</p>
          )}
        </div>

        {children}
        {alimento.notas && <p className="text-sm text-tinta-3">{alimento.notas}</p>}
      </div>
      <div className="sticky bottom-0 border-t border-borde bg-superficie px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <Boton type="submit" ancho disabled={!conversion?.ok || ocupado}>{textoConfirmar}</Boton>
      </div>
    </form>
  );
}
