import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarPlus, Info, Plus, Trash2 } from 'lucide-react';
import {
  calcularTotales, convertirABase, describirCantidad, escalarTotales, formatear, hoy, pesoReceta, recetaComoAlimento,
  totalesReceta,
} from '../../nucleo';
import type { Alimento, ComidaId, IngredienteReceta, Receta } from '../../tipos';
import { COMIDAS } from '../../tipos';
import { AreaTexto, Boton, BotonIcono, Campo, Cargando, Encabezado, Nota, Selector, Tarjeta, Volver } from '../componentes/base';
import { Hoja } from '../componentes/Hoja';
import { MACROS } from '../componentes/Medidores';
import { useAvisos } from '../componentes/Avisos';
import { HojaIngrediente } from '../registro/HojaIngrediente';
import { PanelCantidad } from '../registro/PanelCantidad';
import * as datos from '../servicios/datos';
import { comidaPorHora, leerNumero, nombreComida } from '../util';

export default function EditorReceta() {
  const { id = 'nueva' } = useParams();
  const esNueva = id === 'nueva';
  const [receta, setReceta] = useState<Receta | null | undefined>(esNueva ? null : undefined);
  useEffect(() => {
    if (!esNueva) void datos.obtenerReceta(id).then((r) => setReceta(r ?? null));
  }, [id, esNueva]);
  if (receta === undefined) return <Cargando />;
  if (!esNueva && !receta) return <><Encabezado titulo="Receta no encontrada" volver={<Volver a="/mas/recetas" />} /><p className="px-4 text-tinta-2">Quizá la eliminaste.</p></>;
  return <Formulario key={receta?.id ?? 'nueva'} receta={receta} />;
}

function Formulario({ receta }: { receta: Receta | null }) {
  const navegar = useNavigate();
  const { avisar, confirmar } = useAvisos();
  const [nombre, setNombre] = useState(receta?.nombre ?? '');
  const [porcionesTxt, setPorcionesTxt] = useState(String(receta?.porciones ?? 4));
  const [pesoTxt, setPesoTxt] = useState(receta?.pesoFinalG ? String(receta.pesoFinalG) : '');
  const [notas, setNotas] = useState(receta?.notas ?? '');
  const [ingredientes, setIngredientes] = useState<IngredienteReceta[]>(receta?.ingredientes ?? []);
  const [buscando, setBuscando] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [registrar, setRegistrar] = useState<Alimento | null>(null);
  const [guardando, setGuardando] = useState(false);

  const porciones = leerNumero(porcionesTxt);
  const pesoFinalG = leerNumero(pesoTxt);
  const borrador = { ingredientes, porciones: porciones ?? 1, pesoFinalG: pesoFinalG && pesoFinalG > 0 ? pesoFinalG : undefined };
  const totales = useMemo(() => totalesReceta({ ingredientes }), [ingredientes]);
  const porPorcion = porciones && porciones > 0 ? escalarTotales(totales, 1 / porciones) : null;
  const peso = ingredientes.length ? pesoReceta(borrador) : null;
  const valido = nombre.trim() && ingredientes.length > 0 && porciones && porciones > 0 && (!pesoTxt || (pesoFinalG && pesoFinalG > 0));

  const guardar = async (): Promise<Receta | null> => {
    if (!valido) return null;
    setGuardando(true);
    const d: datos.DatosReceta = { nombre: nombre.trim(), ingredientes, porciones: porciones!, pesoFinalG: borrador.pesoFinalG, notas: notas.trim() || undefined };
    try {
      const r = receta ? await datos.editarReceta(receta.id, d) : await datos.crearReceta(d);
      avisar({ texto: receta ? 'Receta guardada' : 'Receta creada', tono: 'exito' });
      if (!receta) navegar(`/mas/recetas/${r.id}`, { replace: true });
      return r;
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo guardar.', tono: 'error' });
      return null;
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!receta) return;
    if (!(await confirmar({ titulo: `¿Eliminar “${receta.nombre}”?`, texto: 'Las porciones que ya registraste se conservan.', confirmar: 'Eliminar', peligro: true }))) return;
    await datos.eliminarReceta(receta.id);
    avisar({ texto: 'Receta eliminada' });
    navegar('/mas/recetas');
  };

  const abrirRegistro = async () => {
    const r = await guardar();
    if (r) setRegistrar(recetaComoAlimento(r));
  };

  return (
    <div>
      <Encabezado titulo={receta ? 'Editar receta' : 'Nueva receta'} volver={<Volver a="/mas/recetas" />}
        acciones={receta ? <BotonIcono icono={Trash2} etiqueta="Eliminar receta" tono="peligro" onClick={eliminar} /> : undefined} />
      <div className="grid gap-4 px-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:px-0">
        <div className="space-y-4">
          <Tarjeta className="space-y-4 p-4 sm:p-5" aria-label="Datos de la receta">
            <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Pozole rojo de la casa" />
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Rinde" sufijo="porc." inputMode="decimal" value={porcionesTxt} onChange={(e) => setPorcionesTxt(e.target.value)}
                error={porcionesTxt && !(porciones && porciones > 0) ? 'Mayor que 0' : undefined} />
              <Campo etiqueta="Peso final (opcional)" sufijo="g" inputMode="decimal" value={pesoTxt} onChange={(e) => setPesoTxt(e.target.value)} />
            </div>
            <p className="text-sm text-tinta-3">Pesa la olla ya cocinada (sin el recipiente) si quieres registrar esta receta por gramos.</p>
          </Tarjeta>

          <Tarjeta className="overflow-hidden" aria-labelledby="titulo-ingredientes">
            <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
              <h2 id="titulo-ingredientes" className="text-lg font-semibold">Ingredientes</h2>
              <Boton chico variante="secundario" icono={Plus} onClick={() => setBuscando(true)}>Agregar</Boton>
            </div>
            {ingredientes.length === 0 ? (
              <p className="px-4 pb-5 text-tinta-3">Agrega los ingredientes con la cantidad que usas para toda la receta.</p>
            ) : (
              <ul className="divide-y divide-borde border-t border-borde">
                {ingredientes.map((ing, i) => {
                  const t = calcularTotales(ing.instantanea.nutrientes, ing.cantidadBase);
                  return (
                    <li key={`${ing.alimentoId}-${i}`} className="flex items-center">
                      <button type="button" onClick={() => setEditando(i)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4 pr-2 text-left hover:bg-hundido/60">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{ing.instantanea.nombre}</span>
                          <span className="block truncate text-sm text-tinta-3">{describirCantidad(ing.cantidad, ing.unidad, ing.porcionEtiqueta)}</span>
                        </span>
                        <span className="shrink-0 font-semibold cifras">{formatear(t.kcal, 0)} kcal</span>
                      </button>
                      <BotonIcono icono={Trash2} etiqueta={`Quitar ${ing.instantanea.nombre}`} tono="peligro" tam={18} className="mr-1"
                        onClick={() => setIngredientes((l) => l.filter((_, j) => j !== i))} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
          <AreaTexto etiqueta="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        <div className="space-y-3 lg:sticky lg:top-8">
          <Tarjeta className="p-4 sm:p-5" aria-label="Totales">
            <p className="text-sm text-tinta-2">Por porción</p>
            <p className="font-display text-[2.4rem] font-bold leading-none tracking-[-0.03em] cifras">{porPorcion ? formatear(porPorcion.kcal, 0) : '—'}<span className="ml-1.5 text-lg font-semibold text-tinta-2">kcal</span></p>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              {MACROS.map((m) => (
                <div key={m.id}>
                  <dt className="flex items-center gap-1.5 text-xs text-tinta-2"><span className={`size-2 rounded-full ${m.fondo}`} aria-hidden />{m.nombre}</dt>
                  <dd className="font-semibold cifras">{porPorcion ? `${formatear(porPorcion[m.id], 1)} g` : '—'}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 border-t border-borde pt-3 text-sm text-tinta-2 cifras">
              Receta completa: <strong className="text-tinta">{formatear(totales.kcal, 0)} kcal</strong>
              {peso && peso.origen !== 'nominal' && <>, {formatear(peso.pesoG, 0)} g {peso.origen === 'peso_final' ? '(peso final)' : '(suma de ingredientes)'}</>}
            </p>
            {peso?.origen === 'nominal' && (
              <Nota icono={Info} className="mt-3">Mezcla ingredientes en gramos y mililitros: sin peso final, solo se podrá registrar por porciones.</Nota>
            )}
            {totales.incompletos.length > 0 && (
              <Nota tono="aviso" icono={Info} className="mt-3">Faltan datos en: {totales.incompletos.map((x) => x.nombre).join(', ')}. Los totales son un mínimo.</Nota>
            )}
          </Tarjeta>
          <Boton ancho onClick={() => void guardar()} disabled={!valido || guardando}>{receta ? 'Guardar cambios' : 'Crear receta'}</Boton>
          {receta && <Boton ancho variante="secundario" icono={CalendarPlus} onClick={abrirRegistro} disabled={!valido || guardando}>Registrar una porción</Boton>}
        </div>
      </div>

      <HojaIngrediente abierta={buscando} onCerrar={() => setBuscando(false)} excluirId={receta ? `receta:${receta.id}` : undefined}
        onAgregar={(i) => setIngredientes((l) => [...l, i])} />
      {editando !== null && ingredientes[editando] && (
        <EditarIngrediente ingrediente={ingredientes[editando]} onCerrar={() => setEditando(null)}
          onGuardar={(nuevo) => { setIngredientes((l) => l.map((x, j) => (j === editando ? nuevo : x))); setEditando(null); }} />
      )}
      {registrar && <RegistrarPorcion alimento={registrar} onCerrar={() => setRegistrar(null)} />}
    </div>
  );
}

function EditarIngrediente({ ingrediente, onGuardar, onCerrar }: {
  ingrediente: IngredienteReceta; onGuardar: (i: IngredienteReceta) => void; onCerrar: () => void;
}) {
  return (
    <Hoja abierta onCerrar={onCerrar} titulo="Cantidad del ingrediente">
      <PanelCantidad
        alimento={ingrediente.instantanea}
        inicial={{ cantidad: ingrediente.cantidad, unidad: ingrediente.unidad, porcionEtiqueta: ingrediente.porcionEtiqueta }}
        textoConfirmar="Guardar cantidad"
        onConfirmar={(c) => {
          const r = convertirABase(ingrediente.instantanea, c.cantidad, c.unidad, c.porcionEtiqueta);
          if (!r.ok) return;
          const nuevo: IngredienteReceta = { ...ingrediente, cantidad: c.cantidad, unidad: c.unidad, cantidadBase: r.cantidadBase };
          if (c.porcionEtiqueta) nuevo.porcionEtiqueta = c.porcionEtiqueta; else delete nuevo.porcionEtiqueta;
          onGuardar(nuevo);
        }}
      />
    </Hoja>
  );
}

function RegistrarPorcion({ alimento, onCerrar }: { alimento: Alimento; onCerrar: () => void }) {
  const { avisar } = useAvisos();
  const [comida, setComida] = useState<ComidaId>(comidaPorHora());
  const [fecha, setFecha] = useState(hoy());
  return (
    <Hoja abierta onCerrar={onCerrar} titulo={`Registrar ${alimento.nombre}`}>
      <PanelCantidad
        alimento={alimento}
        textoConfirmar={`Agregar a ${nombreComida(comida)}`}
        onConfirmar={async (c) => {
          try {
            const r = await datos.agregarRegistro({ fecha, comida, alimento, cantidad: c.cantidad, unidad: c.unidad, porcionEtiqueta: c.porcionEtiqueta });
            avisar({ texto: `Agregado a ${nombreComida(comida)}`, tono: 'exito', accion: { texto: 'Deshacer', alHacer: () => void datos.eliminarRegistro(r.id) } });
            onCerrar();
          } catch (e) {
            avisar({ texto: e instanceof Error ? e.message : 'No se pudo registrar.', tono: 'error' });
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Selector etiqueta="Comida" value={comida} onChange={(e) => setComida(e.target.value as ComidaId)}>
            {COMIDAS.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </Selector>
          <Campo etiqueta="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value || hoy())} />
        </div>
      </PanelCantidad>
    </Hoja>
  );
}
