import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  ArrowLeft, ChevronDown, Copy, History, LoaderCircle, Plus, ScanBarcode, Search, Star, TrendingUp, WifiOff, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  calcularTotales, convertirABase, describirCantidad, sumarDias, sumarTotales, unidadPredeterminada,
} from '../../nucleo';
import type { Alimento, ComidaId, RegistroComida } from '../../tipos';
import { COMIDAS } from '../../tipos';
import { Boton, BotonIcono, Nota, Segmentado } from '../componentes/base';
import { Hoja } from '../componentes/Hoja';
import { useAvisos } from '../componentes/Avisos';
import * as datos from '../servicios/datos';
import type { Favorito, UsoAlimento } from '../servicios/datos';
import { kcal, nombreComida, vibrar } from '../util';
import { Escaner } from './Escaner';
import { PanelCantidad } from './PanelCantidad';
import { ResultadosBusqueda } from './Resultados';
import { useBusqueda } from './useBusqueda';
import type { Cantidad } from './PanelCantidad';

type Instantanea = RegistroComida['instantanea'];

interface Seleccion {
  id: string;
  alimento: Alimento | null;
  cargando: boolean;
  error?: string;
  inicial?: Cantidad;
}

type Pestana = 'recientes' | 'frecuentes' | 'favoritos';


/** kcal de un uso guardado (última cantidad) calculadas con el motor. */
function kcalDeUso(inst: Instantanea, c: Cantidad): number | null {
  const r = convertirABase(inst, c.cantidad, c.unidad, c.porcionEtiqueta);
  return r.ok ? calcularTotales(inst.nutrientes, r.cantidadBase).kcal : null;
}

function cantidadSugerida(inst: Instantanea): Cantidad | null {
  const o = unidadPredeterminada(inst);
  if (!o) return null;
  return { cantidad: o.unidad === 'g' || o.unidad === 'ml' ? 100 : 1, unidad: o.unidad, porcionEtiqueta: o.porcionEtiqueta };
}

export function HojaRegistro({ abierta, onCerrar, fecha, comidaInicial }: {
  abierta: boolean; onCerrar: () => void; fecha: string; comidaInicial: ComidaId;
}) {
  const { avisar } = useAvisos();
  const [comida, setComida] = useState<ComidaId>(comidaInicial);
  const [vista, setVista] = useState<'buscar' | 'cantidad' | 'codigo'>('buscar');
  const busqueda = useBusqueda();
  const { texto, setTexto, estado } = busqueda;
  const [pestana, setPestana] = useState<Pestana>('recientes');
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [agregados, setAgregados] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);
  const [codigoNoEncontrado, setCodigoNoEncontrado] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierta) {
      setComida(comidaInicial);
      setVista('buscar');
      setTexto('');
      setAgregados(0);
      setSeleccion(null);
      setCodigoNoEncontrado(null);
    }
  }, [abierta, comidaInicial, setTexto]);

  const sugerencias = datos.useSugerencias(comida);
  const ayer = sumarDias(fecha, -1);
  const deAyer = datos.useRegistrosComida(ayer, comida);
  const favoritoActual = datos.useEsFavorito(seleccion?.alimento?.id);

  // ── Selección y registro ──
  const abrirAlimento = useCallback(async (id: string, inicial?: Cantidad, yaCargado?: Alimento) => {
    setVista('cantidad');
    if (yaCargado) { setSeleccion({ id, alimento: yaCargado, cargando: false, inicial }); return; }
    setSeleccion({ id, alimento: null, cargando: true, inicial });
    try {
      const a = await datos.obtenerAlimento(id);
      setSeleccion((s) => (s?.id === id ? { id, alimento: a, cargando: false, inicial, error: a ? undefined : 'No se pudo cargar este alimento. Revisa tu conexión e inténtalo de nuevo.' } : s));
    } catch {
      setSeleccion((s) => (s?.id === id ? { id, alimento: null, cargando: false, inicial, error: 'No se pudo cargar este alimento.' } : s));
    }
  }, []);

  const volverABuscar = () => {
    setVista('buscar');
    setSeleccion(null);
    window.setTimeout(() => entrada.current?.focus(), 30);
  };

  const registrar = async (alimento: Alimento | (Instantanea & { id: string }), c: Cantidad) => {
    const r = await datos.agregarRegistro({ fecha, comida, alimento, cantidad: c.cantidad, unidad: c.unidad, porcionEtiqueta: c.porcionEtiqueta });
    vibrar();
    setAgregados((n) => n + 1);
    avisar({
      texto: `Agregado a ${nombreComida(comida)}: ${alimento.nombre}`,
      tono: 'exito',
      accion: { texto: 'Deshacer', alHacer: () => { void datos.eliminarRegistro(r.id); setAgregados((n) => Math.max(0, n - 1)); } },
    });
    return r;
  };

  const confirmarCantidad = async (c: Cantidad) => {
    if (!seleccion?.alimento) return;
    setGuardando(true);
    try {
      await registrar(seleccion.alimento, c);
      setTexto('');
      volverABuscar();
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo agregar.', tono: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const agregarRapido = async (alimentoId: string, inst: Instantanea, c: Cantidad) => {
    try {
      await registrar({ ...inst, id: alimentoId }, c);
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo agregar.', tono: 'error' });
    }
  };

  const copiarDeAyer = async () => {
    try {
      const copias = await datos.copiarComida(ayer, comida, fecha, comida);
      vibrar();
      setAgregados((n) => n + copias.length);
      avisar({
        texto: `${copias.length === 1 ? 'Se copió 1 alimento' : `Se copiaron ${copias.length} alimentos`} de ayer`,
        tono: 'exito',
        accion: { texto: 'Deshacer', alHacer: () => { copias.forEach((x) => void datos.eliminarRegistro(x.id)); } },
      });
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo copiar.', tono: 'error' });
    }
  };

  const buscarCodigo = useCallback(async (codigo: string) => {
    setBuscandoCodigo(true);
    setCodigoNoEncontrado(null);
    try {
      const a = await datos.buscarPorCodigo(codigo);
      if (a) await abrirAlimento(a.id, undefined, a);
      else setCodigoNoEncontrado(codigo);
    } finally {
      setBuscandoCodigo(false);
    }
  }, [abrirAlimento]);

  const alternarFavorito = async () => {
    if (!seleccion?.alimento) return;
    const ahora = await datos.alternarFavorito(seleccion.alimento);
    avisar({ texto: ahora ? 'Agregado a favoritos' : 'Quitado de favoritos', tono: 'exito' });
  };

  const usoPorId = useMemo(() => {
    const m = new Map<string, UsoAlimento>();
    for (const u of [...(sugerencias?.frecuentes ?? []), ...(sugerencias?.recientes ?? [])]) if (!m.has(u.alimentoId)) m.set(u.alimentoId, u);
    return m;
  }, [sugerencias]);

  const totalAyer = deAyer?.length ? sumarTotales(deAyer.map((r) => r.totales)).kcal : 0;

  // ── Encabezado ──
  const selectorComida = (
    <label className="relative inline-flex max-w-full items-center">
      <span className="sr-only">Comida</span>
      <span aria-hidden className="mr-1 text-tinta-2">Agregar a</span>
      <select
        value={comida}
        onChange={(e) => setComida(e.target.value as ComidaId)}
        style={{ fieldSizing: 'content' } as React.CSSProperties}
        className="min-h-11 max-w-[60vw] cursor-pointer appearance-none truncate rounded-control bg-transparent pl-1 pr-6 font-display text-lg font-semibold text-talavera hover:bg-talavera-tinte focus:outline-none"
      >
        {COMIDAS.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <ChevronDown aria-hidden size={18} className="pointer-events-none absolute right-1 text-talavera" />
    </label>
  );

  const barraBusqueda = vista === 'buscar' && (
    <div className="px-4 pb-3">
      <div className="flex items-center gap-1 rounded-control border border-borde bg-hundido pl-3 focus-within:border-talavera focus-within:bg-superficie focus-within:ring-2 focus-within:ring-talavera/30">
        <Search aria-hidden size={20} className="shrink-0 text-tinta-3" />
        <input
          ref={entrada}
          data-autofoco
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Buscar alimento"
          placeholder="Busca un alimento o marca"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="min-h-12 w-full min-w-0 bg-transparent px-1 text-[1.05rem] placeholder:text-tinta-3 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {estado === 'buscando' && <LoaderCircle aria-label="Buscando" size={18} className="shrink-0 animate-spin text-tinta-3" />}
        {texto && <BotonIcono icono={X} etiqueta="Borrar búsqueda" tam={18} onClick={() => { setTexto(''); entrada.current?.focus(); }} />}
        <BotonIcono icono={ScanBarcode} etiqueta="Buscar por código de barras" tono="talavera" onClick={() => { setVista('codigo'); setCodigoNoEncontrado(null); }} />
      </div>
    </div>
  );

  const titulo = vista === 'buscar' ? selectorComida
    : vista === 'codigo' ? 'Código de barras'
      : `Agregar a ${nombreComida(comida)}`;

  return (
    <Hoja
      abierta={abierta}
      onCerrar={onCerrar}
      titulo={titulo}
      etiqueta={`Agregar alimento a ${nombreComida(comida)}`}
      alto="completa"
      focoInicial={vista === 'buscar' ? entrada : undefined}
      encabezadoExtra={barraBusqueda}
      accionIzquierda={vista !== 'buscar' ? <BotonIcono icono={ArrowLeft} etiqueta="Volver a la búsqueda" onClick={volverABuscar} /> : undefined}
      pie={vista === 'buscar' && agregados > 0 ? (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm text-tinta-2"><span className="font-semibold text-tinta">{agregados}</span> {agregados === 1 ? 'alimento agregado' : 'alimentos agregados'}</p>
          <Boton onClick={onCerrar}>Listo</Boton>
        </div>
      ) : undefined}
    >
      {vista === 'codigo' && (
        <>
          <Escaner onCodigo={buscarCodigo} buscando={buscandoCodigo} />
          {codigoNoEncontrado && (
            <div className="px-4 pb-6">
              <Nota tono="aviso">
                <p>No encontramos el código <span className="font-semibold cifras">{codigoNoEncontrado}</span> en el catálogo{navigator.onLine ? '' : ' (estás sin conexión)'}.</p>
                <Link to={`/mas/alimentos/nuevo?codigo=${codigoNoEncontrado}`} onClick={onCerrar} className="mt-2 inline-flex min-h-11 items-center font-semibold text-talavera underline underline-offset-2">
                  Crear este alimento
                </Link>
              </Nota>
            </div>
          )}
        </>
      )}

      {vista === 'cantidad' && seleccion && (
        seleccion.cargando ? (
          <div role="status" className="flex items-center justify-center gap-3 py-16 text-tinta-3">
            <LoaderCircle aria-hidden className="animate-spin" /> Cargando alimento…
          </div>
        ) : seleccion.alimento ? (
          <PanelCantidad
            key={seleccion.id}
            alimento={seleccion.alimento}
            inicial={seleccion.inicial}
            textoConfirmar={`Agregar a ${nombreComida(comida)}`}
            ocupado={guardando}
            onConfirmar={confirmarCantidad}
            accesorios={(
              <BotonIcono
                icono={Star}
                etiqueta={favoritoActual ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                aria-pressed={!!favoritoActual}
                tono="talavera"
                className={favoritoActual ? '[&_svg]:fill-current' : ''}
                onClick={alternarFavorito}
              />
            )}
          />
        ) : (
          <div className="p-4"><Nota tono="aviso" icono={WifiOff}>{seleccion.error}</Nota></div>
        )
      )}

      {vista === 'buscar' && (
        texto.trim() ? (
          <ResultadosBusqueda
            {...busqueda.vista}
            onElegir={(id, a) => abrirAlimento(id, usoPorId.get(id) ? { cantidad: usoPorId.get(id)!.cantidad, unidad: usoPorId.get(id)!.unidad, porcionEtiqueta: usoPorId.get(id)!.porcionEtiqueta } : undefined, a)}
            texto={texto.trim()}
            onCerrar={onCerrar}
          />
        ) : (
          <div className="pb-6">
            {deAyer && deAyer.length > 0 && (
              <div className="px-4 pb-3">
                <button
                  type="button"
                  onClick={copiarDeAyer}
                  className="flex min-h-12 w-full items-center gap-3 rounded-control border border-dashed border-talavera/50 px-3.5 py-2.5 text-left hover:bg-talavera-tinte"
                >
                  <Copy aria-hidden size={20} className="shrink-0 text-talavera" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-talavera">Copiar {nombreComida(comida).toLowerCase()} de ayer</span>
                    <span className="block text-sm text-tinta-2 cifras">{deAyer.length} {deAyer.length === 1 ? 'alimento' : 'alimentos'}, {kcal(totalAyer)} kcal</span>
                  </span>
                </button>
              </div>
            )}
            <div className="px-4">
              <Segmentado<Pestana>
                etiqueta="Sugerencias"
                valor={pestana}
                onCambio={setPestana}
                opciones={[
                  { valor: 'recientes', texto: 'Recientes' },
                  { valor: 'frecuentes', texto: 'Frecuentes' },
                  { valor: 'favoritos', texto: 'Favoritos' },
                ]}
              />
            </div>
            <ListaRapida
              pestana={pestana}
              comida={comida}
              recientes={sugerencias?.recientes}
              frecuentes={sugerencias?.frecuentes}
              favoritos={sugerencias?.favoritos}
              usoPorId={usoPorId}
              onAbrir={(id, c) => abrirAlimento(id, c)}
              onRapido={agregarRapido}
            />
          </div>
        )
      )}
    </Hoja>
  );
}

function ListaRapida({ pestana, comida, recientes, frecuentes, favoritos, usoPorId, onAbrir, onRapido }: {
  pestana: Pestana;
  comida: ComidaId;
  recientes?: UsoAlimento[];
  frecuentes?: UsoAlimento[];
  favoritos?: Favorito[];
  usoPorId: Map<string, UsoAlimento>;
  onAbrir: (id: string, c?: Cantidad) => void;
  onRapido: (id: string, inst: Instantanea, c: Cantidad) => void;
}) {
  if (!recientes || !frecuentes || !favoritos) return null;
  const items = pestana === 'favoritos'
    ? favoritos.map((f) => {
      const u = usoPorId.get(f.alimentoId);
      const c = u ? { cantidad: u.cantidad, unidad: u.unidad, porcionEtiqueta: u.porcionEtiqueta } : cantidadSugerida(f.instantanea);
      return { id: f.alimentoId, nombre: f.nombre, marca: f.marca, inst: f.instantanea, c, usos: u?.usos };
    })
    : (pestana === 'recientes' ? recientes : frecuentes).map((u) => ({
      id: u.alimentoId, nombre: u.nombre, marca: u.marca, inst: u.instantanea,
      c: { cantidad: u.cantidad, unidad: u.unidad, porcionEtiqueta: u.porcionEtiqueta } as Cantidad | null, usos: u.usos,
    }));

  if (!items.length) {
    const vacio = {
      recientes: { icono: History, texto: 'Lo que registres aparecerá aquí para agregarlo de nuevo con un toque.' },
      frecuentes: { icono: TrendingUp, texto: `Los alimentos que repitas en ${nombreComida(comida).toLowerCase()} aparecerán aquí.` },
      favoritos: { icono: Star, texto: 'Marca con la estrella los alimentos que más usas.' },
    }[pestana];
    const Icono = vacio.icono;
    return (
      <div className="flex flex-col items-center px-8 py-10 text-center text-tinta-2">
        <Icono aria-hidden size={28} className="mb-2 text-tinta-3" />
        <p>{vacio.texto}</p>
        <p className="mt-1 text-sm text-tinta-3">Empieza escribiendo arriba, por ejemplo “tortilla” o “huevo”.</p>
      </div>
    );
  }

  return (
    <ul className="mt-2 divide-y divide-borde/70" aria-label={pestana}>
      {items.map((it) => {
        const k = it.c ? kcalDeUso(it.inst, it.c) : null;
        return (
          <li key={it.id} className="flex items-center">
            <button type="button" onClick={() => onAbrir(it.id, it.c ?? undefined)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-2 text-left hover:bg-hundido/60">
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-semibold leading-snug">{it.nombre}</span>
                <span className="mt-0.5 block truncate text-sm text-tinta-3">
                  {[it.marca, it.c ? describirCantidad(it.c.cantidad, it.c.unidad, it.c.porcionEtiqueta) : null].filter(Boolean).join(', ')}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold cifras">{k !== null ? kcal(k) : '—'}</span>
                <span className="block text-xs text-tinta-3">kcal</span>
              </span>
            </button>
            {it.c && (
              <button
                type="button"
                aria-label={`Agregar ${it.nombre}, ${describirCantidad(it.c.cantidad, it.c.unidad, it.c.porcionEtiqueta)}`}
                onClick={() => onRapido(it.id, it.inst, it.c!)}
                className="mr-2 flex size-11 shrink-0 items-center justify-center rounded-full bg-talavera-tinte text-talavera transition hover:bg-talavera hover:text-sobre-talavera active:scale-95"
              >
                <Plus aria-hidden size={22} strokeWidth={2.5} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

