import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Info, Pencil, Scale, Trash2 } from 'lucide-react';
import {
  formatear, formatearFechaCorta, formatearFechaLarga, hoy, nombreMes, promediosMensuales, promediosSemanales,
  serieTendencia, sumarDias,
} from '../../nucleo';
import type { RegistroPeso } from '../../tipos';
import { Boton, BotonIcono, Campo, Cargando, Encabezado, Nota, Segmentado, Tarjeta, Vacio } from '../componentes/base';
import { GraficaPeso } from '../componentes/Graficas';
import type { PuntoPesoGrafica } from '../componentes/Graficas';
import { Hoja } from '../componentes/Hoja';
import { useAvisos } from '../componentes/Avisos';
import * as datos from '../servicios/datos';
import { cx, leerNumero } from '../util';

type Rango = '30' | '90' | '365' | 'todo';

function signo(n: number, dec = 1): string {
  const t = formatear(Math.abs(n), dec);
  return n > 0 ? `+${t}` : n < 0 ? `−${t}` : t;
}

export default function Peso() {
  const pesos = datos.usePesos();
  const resumen = datos.useResumenPeso();
  const perfil = datos.usePerfil();
  const { avisar } = useAvisos();
  const [params, setParams] = useSearchParams();
  const [rango, setRango] = useState<Rango>('90');
  const [agrupar, setAgrupar] = useState<'semana' | 'mes'>('semana');
  const [editando, setEditando] = useState<RegistroPeso | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (params.get('nuevo') === '1') {
      entrada.current?.focus();
      params.delete('nuevo');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const serie = useMemo(() => (pesos ? serieTendencia(pesos) : []), [pesos]);
  const puntos: PuntoPesoGrafica[] = useMemo(() => {
    const desde = rango === 'todo' ? '0000-01-01' : sumarDias(hoy(), -Number(rango));
    return serie.filter((p) => p.fecha >= desde).map((p) => ({
      etiqueta: formatearFechaCorta(p.fecha),
      etiquetaLarga: formatearFechaLarga(p.fecha),
      peso: p.pesoKg,
      tendencia: p.tendenciaKg,
    }));
  }, [serie, rango]);

  const promedios = useMemo(() => {
    if (!pesos) return [];
    return agrupar === 'semana'
      ? promediosSemanales(pesos).reverse().slice(0, 12).map((p) => ({ clave: p.inicio, texto: `Semana del ${formatearFechaCorta(p.inicio)}`, ...p }))
      : promediosMensuales(pesos).reverse().slice(0, 12).map((p) => ({ clave: p.mes, texto: `${nombreMes(p.mes)} ${p.mes.slice(0, 4)}`, ...p }));
  }, [pesos, agrupar]);

  const eliminar = async (p: RegistroPeso) => {
    await datos.eliminarPeso(p.id);
    avisar({
      texto: `Peso del ${formatearFechaCorta(p.fecha)} eliminado`,
      accion: { texto: 'Deshacer', alHacer: () => void datos.registrarPeso({ pesoKg: p.pesoKg, fecha: p.fecha, nota: p.nota }) },
    });
  };

  if (!pesos || !resumen) return <><Encabezado titulo="Peso" /><Cargando /></>;

  const objetivo = resumen.objetivoKg ?? perfil?.pesoObjetivoKg ?? null;

  return (
    <div>
      <Encabezado titulo="Peso" subtitulo="Pésate a la misma hora, idealmente en ayunas." />
      <div className="space-y-4 px-3 lg:px-0">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <FormularioPeso entrada={entrada} />
          <Tarjeta className="p-4 sm:p-5" aria-label="Resumen de peso">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
              <Dato titulo="Actual" valor={resumen.actual ? `${formatear(resumen.actual.pesoKg, 1)} kg` : '—'}
                nota={resumen.actual ? formatearFechaCorta(resumen.actual.fecha) : undefined} grande />
              <Dato titulo="Tendencia" valor={resumen.tendenciaKg !== null ? `${formatear(resumen.tendenciaKg, 1)} kg` : '—'}
                nota={resumen.ritmoKgSemana !== null ? `${signo(resumen.ritmoKgSemana, 2)} kg por semana` : 'Faltan datos para el ritmo'} />
              <Dato titulo="Desde el inicio" valor={resumen.variacionKg !== null ? `${signo(resumen.variacionKg)} kg` : '—'}
                nota={resumen.inicialKg !== null ? `Inicial: ${formatear(resumen.inicialKg, 1)} kg` : undefined} />
              <Dato titulo="Al objetivo" valor={resumen.distanciaObjetivoKg !== null ? (resumen.objetivoAlcanzado ? 'Alcanzado' : `${formatear(Math.abs(resumen.distanciaObjetivoKg), 1)} kg`) : '—'}
                nota={objetivo ? `Objetivo: ${formatear(objetivo, 1)} kg${resumen.fechaEstimada ? `, aprox. ${formatearFechaCorta(resumen.fechaEstimada, true)}` : ''}` : 'Defínelo en Perfil y metas'} />
            </dl>
            {resumen.progreso !== null && (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-hundido" role="progressbar" aria-label="Avance hacia el objetivo"
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(resumen.progreso * 100)}>
                  <div className="h-full rounded-full bg-talavera" style={{ width: `${resumen.progreso * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-tinta-3 cifras">{formatear(resumen.progreso * 100, 0)} % del camino al objetivo</p>
              </div>
            )}
          </Tarjeta>
        </div>

        <Nota icono={Info}>
          Tu peso sube y baja de un día a otro por agua, sal, digestión y ciclo hormonal; esas variaciones no son cambios de grasa.
          Fíjate en la línea de tendencia, que suaviza ese ruido.
        </Nota>
        {resumen.avisos.map((a) => <Nota key={a} tono="aviso" icono={Info}>{a}</Nota>)}

        {pesos.length === 0 ? (
          <Tarjeta><Vacio icono={Scale} titulo="Registra tu primer peso" texto="Con algunos registros verás tu tendencia, promedios y cuánto te falta para tu objetivo." /></Tarjeta>
        ) : (
          <>
            <GraficaPeso
              titulo="Peso y tendencia"
              datos={puntos}
              objetivo={objetivo}
              alto={260}
              accion={(
                <select aria-label="Periodo de la gráfica" value={rango} onChange={(e) => setRango(e.target.value as Rango)}
                  className="min-h-10 rounded-full border border-borde bg-superficie px-3 text-sm font-semibold">
                  <option value="30">30 días</option>
                  <option value="90">3 meses</option>
                  <option value="365">12 meses</option>
                  <option value="todo">Todo</option>
                </select>
              )}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Tarjeta className="p-4 sm:p-5" aria-labelledby="titulo-promedios">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 id="titulo-promedios" className="text-lg font-semibold">Promedios</h2>
                  <Segmentado etiqueta="Agrupar por" valor={agrupar} onCambio={setAgrupar} className="w-48"
                    opciones={[{ valor: 'semana', texto: 'Semana' }, { valor: 'mes', texto: 'Mes' }]} />
                </div>
                <ul className="divide-y divide-borde">
                  {promedios.map((p, i) => {
                    const previo = promedios[i + 1];
                    const dif = previo ? p.promedioKg - previo.promedioKg : null;
                    return (
                      <li key={p.clave} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="first-letter:uppercase">{p.texto}<span className="block text-xs text-tinta-3">{p.registros} {p.registros === 1 ? 'registro' : 'registros'}</span></span>
                        <span className="text-right cifras">
                          <span className="font-semibold">{formatear(p.promedioKg, 1)} kg</span>
                          {dif !== null && <span className="block text-xs text-tinta-3">{signo(dif)} kg vs anterior</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Tarjeta>

              <Tarjeta className="p-4 sm:p-5" aria-labelledby="titulo-historial">
                <h2 id="titulo-historial" className="mb-2 text-lg font-semibold">Historial</h2>
                <ul className="max-h-[26rem] divide-y divide-borde overflow-y-auto">
                  {[...pesos].reverse().map((p) => (
                    <li key={p.id} className="flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block first-letter:uppercase">{formatearFechaLarga(p.fecha)}</span>
                        {p.nota && <span className="block truncate text-sm text-tinta-3">{p.nota}</span>}
                      </span>
                      <span className="font-semibold cifras">{formatear(p.pesoKg, 1)} kg</span>
                      <BotonIcono icono={Pencil} etiqueta={`Editar peso del ${formatearFechaCorta(p.fecha)}`} tam={18} onClick={() => setEditando(p)} />
                      <BotonIcono icono={Trash2} etiqueta={`Eliminar peso del ${formatearFechaCorta(p.fecha)}`} tono="peligro" tam={18} onClick={() => eliminar(p)} />
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            </div>
          </>
        )}
      </div>
      {editando && <EditarPeso registro={editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

function Dato({ titulo, valor, nota, grande }: { titulo: string; valor: string; nota?: string; grande?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-tinta-2">{titulo}</dt>
      <dd className={cx('font-display font-semibold leading-tight', grande ? 'text-[1.7rem]' : 'text-xl')}>{valor}</dd>
      {nota && <dd className="text-xs text-tinta-3">{nota}</dd>}
    </div>
  );
}

function FormularioPeso({ entrada }: { entrada: RefObject<HTMLInputElement | null> }) {
  const { avisar } = useAvisos();
  const [texto, setTexto] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const existente = datos.usePesoDeFecha(fecha);
  const valor = leerNumero(texto);
  const valido = valor !== undefined && valor >= 20 && valor <= 400;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    try {
      await datos.registrarPeso({ pesoKg: valor, fecha });
      avisar({ texto: `Peso guardado: ${formatear(valor, 1)} kg`, tono: 'exito' });
      setTexto('');
    } catch (err) {
      avisar({ texto: err instanceof Error ? err.message : 'No se pudo guardar el peso.', tono: 'error' });
    }
  };

  return (
    <Tarjeta className="p-4 sm:p-5" aria-labelledby="titulo-nuevo-peso">
      <h2 id="titulo-nuevo-peso" className="mb-3 text-lg font-semibold">Registrar peso</h2>
      <form onSubmit={guardar} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo ref={entrada} etiqueta="Peso" sufijo="kg" inputMode="decimal" autoComplete="off" placeholder={existente ? formatear(existente.pesoKg, 1) : '70.5'}
            value={texto} onChange={(e) => setTexto(e.target.value)}
            error={texto && !valido ? 'Entre 20 y 400 kg' : undefined} />
          <Campo etiqueta="Fecha" type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value || hoy())} />
        </div>
        {existente && <p className="text-sm text-tinta-3">Ya registraste {formatear(existente.pesoKg, 1)} kg ese día; se reemplazará.</p>}
        <Boton type="submit" ancho disabled={!valido}>{existente ? 'Reemplazar peso' : 'Guardar peso'}</Boton>
      </form>
    </Tarjeta>
  );
}

function EditarPeso({ registro, onCerrar }: { registro: RegistroPeso; onCerrar: () => void }) {
  const { avisar } = useAvisos();
  const [texto, setTexto] = useState(String(registro.pesoKg));
  const [fecha, setFecha] = useState(registro.fecha);
  const [nota, setNota] = useState(registro.nota ?? '');
  const valor = leerNumero(texto);
  const valido = valor !== undefined && valor >= 20 && valor <= 400;
  const guardar = async () => {
    if (!valido) return;
    try {
      await datos.editarPeso(registro.id, { pesoKg: valor, fecha, nota: nota.trim() || null });
      avisar({ texto: 'Cambios guardados', tono: 'exito' });
      onCerrar();
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo guardar.', tono: 'error' });
    }
  };
  return (
    <Hoja abierta onCerrar={onCerrar} titulo="Editar peso" pie={<Boton ancho onClick={guardar} disabled={!valido}>Guardar cambios</Boton>}>
      <div className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Peso" sufijo="kg" inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} data-autofoco
            error={!valido ? 'Entre 20 y 400 kg' : undefined} />
          <Campo etiqueta="Fecha" type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value || registro.fecha)} />
        </div>
        <Campo etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={140} />
      </div>
    </Hoja>
  );
}
