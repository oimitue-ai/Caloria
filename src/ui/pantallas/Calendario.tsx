import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  diaSemana, finMes, formatear, formatearFechaLarga, hoy, inicioMes, nombreMes, rangoFechas, sumarMeses,
} from '../../nucleo';
import type { DiaEstadistica } from '../../nucleo';
import { BotonIcono, Cargando, Encabezado, Tarjeta } from '../componentes/base';
import { useEstadisticas, usePesos } from '../servicios/datos';
import { cx, kcal } from '../util';

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

type Estado = 'vacio' | 'cumple' | 'bajo' | 'exceso' | 'sinMeta' | 'futuro';

function estadoDia(d: DiaEstadistica | undefined, futuro: boolean): Estado {
  if (futuro) return 'futuro';
  if (!d || !d.registrado) return 'vacio';
  if (d.cumple === true) return 'cumple';
  if (d.proporcionMeta === null) return 'sinMeta';
  return d.proporcionMeta < 1 ? 'bajo' : 'exceso';
}

const ESTILO: Record<Estado, string> = {
  vacio: 'text-tinta-3',
  futuro: 'text-tinta-3/60',
  cumple: 'bg-exito-tinte text-tinta',
  bajo: 'bg-talavera-tinte text-tinta',
  exceso: 'bg-exceso-tinte text-tinta',
  sinMeta: 'bg-hundido text-tinta',
};

const DESCRIPCION: Record<Estado, string> = {
  vacio: 'sin registro',
  futuro: '',
  cumple: 'dentro de tu meta',
  bajo: 'por debajo de tu meta',
  exceso: 'por encima de tu meta',
  sinMeta: 'registrado, sin meta',
};

export default function Calendario() {
  const h = hoy();
  const [mes, setMes] = useState(inicioMes(h));
  const fin = finMes(mes);
  const est = useEstadisticas(mes, fin, { hoy: h });
  const pesos = usePesos(mes, fin);
  const navegar = useNavigate();

  const porFecha = useMemo(() => new Map(est?.serie.map((d) => [d.fecha, d]) ?? []), [est]);
  const pesoPorFecha = useMemo(() => new Map(pesos?.map((p) => [p.fecha, p.pesoKg]) ?? []), [pesos]);
  const dias = rangoFechas(mes, fin);
  const relleno = diaSemana(mes);
  const titulo = `${nombreMes(mes)} ${mes.slice(0, 4)}`;

  return (
    <div>
      <Encabezado titulo="Calendario" subtitulo="Toca un día para ver y editar lo que registraste." />
      <div className="px-3 lg:px-0">
        <Tarjeta className="p-3 sm:p-5">
          <div className="mb-3 flex items-center">
            <BotonIcono icono={ChevronLeft} etiqueta="Mes anterior" onClick={() => setMes(sumarMeses(mes, -1))} />
            <h2 className="flex-1 text-center text-xl font-semibold first-letter:uppercase" aria-live="polite">{titulo}</h2>
            <BotonIcono icono={ChevronRight} etiqueta="Mes siguiente" onClick={() => setMes(sumarMeses(mes, 1))} />
          </div>
          {!est ? <Cargando /> : (
            <div role="grid" aria-label={`Calendario de ${titulo}`}>
              <div role="row" className="grid grid-cols-7 gap-1 pb-1">
                {DIAS.map((d, i) => (
                  <div role="columnheader" key={i} aria-label={DIAS_LARGOS[i]} className="text-center text-xs font-semibold text-tinta-3">{d}</div>
                ))}
              </div>
              {/* Filas por semana con display:contents: estructura ARIA de grid válida (row › gridcell) sin cambiar
                  el diseño de 7 columnas. Auditoría (Agente 4): axe aria-required-children/aria-required-parent. */}
              <div className="grid grid-cols-7 gap-1">
                {semanasDe([...Array.from({ length: relleno }, () => null), ...dias]).map((semana, iSemana) => (
                <div role="row" className="contents" key={`s${iSemana}`}>
                {semana.map((f, iDia) => {
                  if (f === null) return <div key={`r${iDia}`} aria-hidden />;
                  const d = porFecha.get(f);
                  const futuro = f > h;
                  const estado = estadoDia(d, futuro);
                  const peso = pesoPorFecha.get(f);
                  const etiqueta = [
                    formatearFechaLarga(f),
                    DESCRIPCION[estado],
                    d?.registrado && d.totales ? `${kcal(d.totales.kcal)} kcal` : '',
                    peso !== undefined ? `peso ${formatear(peso, 1)} kg` : '',
                  ].filter(Boolean).join(', ');
                  return (
                    <button
                      key={f}
                      type="button"
                      role="gridcell"
                      aria-label={etiqueta}
                      aria-current={f === h ? 'date' : undefined}
                      onClick={() => navegar(f === h ? '/' : `/?fecha=${f}`)}
                      className={cx(
                        'relative flex aspect-[0.86] min-h-12 flex-col items-center justify-start rounded-xl pt-1.5 transition hover:ring-2 hover:ring-talavera/40',
                        ESTILO[estado],
                        f === h && 'ring-2 ring-talavera',
                      )}
                    >
                      <span className={cx('text-[0.95rem] leading-none cifras', f === h ? 'font-bold text-talavera' : 'font-semibold')}>{Number(f.slice(8))}</span>
                      {d?.registrado && d.totales && (
                        <span className="mt-1 text-[0.66rem] leading-none text-tinta-2 cifras">{kcal(d.totales.kcal)}</span>
                      )}
                      {peso !== undefined && (
                        <span className="absolute bottom-1 text-[0.62rem] font-semibold leading-none text-tinta-2 cifras" aria-hidden>
                          {formatear(peso, 1)}
                        </span>
                      )}
                    </button>
                  );
                })}
                </div>
                ))}
              </div>
            </div>
          )}
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-tinta-2" aria-label="Leyenda">
            <li className="flex items-center gap-2"><span className="size-3.5 rounded bg-exito-tinte ring-1 ring-exito/40" aria-hidden />Dentro de la meta (±10 %)</li>
            <li className="flex items-center gap-2"><span className="size-3.5 rounded bg-talavera-tinte ring-1 ring-talavera/40" aria-hidden />Por debajo</li>
            <li className="flex items-center gap-2"><span className="size-3.5 rounded bg-exceso-tinte ring-1 ring-exceso/40" aria-hidden />Por encima</li>
            <li className="flex items-center gap-2"><span className="size-3.5 rounded bg-hundido ring-1 ring-borde" aria-hidden />Registrado, sin meta ese día</li>
            <li className="flex items-center gap-2"><span className="size-3.5 rounded ring-1 ring-borde" aria-hidden />Sin registro</li>
          </ul>
          <p className="mt-2 text-xs text-tinta-3">El número pequeño de abajo es tu peso en kg; el de arriba, las kcal del día.</p>
        </Tarjeta>

        {est && (
          <Tarjeta className="mt-4 p-4 sm:p-5" aria-label="Resumen del mes">
            <h2 className="text-lg font-semibold">Resumen del mes</h2>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <div><dt className="text-sm text-tinta-2">Días registrados</dt><dd className="font-display text-2xl font-semibold cifras">{est.diasRegistrados}<span className="text-base text-tinta-3"> / {est.diasPeriodo}</span></dd></div>
              <div><dt className="text-sm text-tinta-2">Promedio diario</dt><dd className="font-display text-2xl font-semibold cifras">{est.promedio ? kcal(est.promedio.kcal) : '—'}<span className="text-base text-tinta-3"> kcal</span></dd></div>
              <div><dt className="text-sm text-tinta-2">Cumplimiento</dt><dd className="font-display text-2xl font-semibold cifras">{est.cumplimiento !== null ? `${formatear(est.cumplimiento * 100, 0)} %` : '—'}</dd></div>
            </dl>
          </Tarjeta>
        )}
      </div>
    </div>
  );
}

/** Parte la lista de celdas del mes (con huecos iniciales `null`) en semanas de 7. */
function semanasDe<T>(celdas: (T | null)[]): (T | null)[][] {
  const out: (T | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) out.push(celdas.slice(i, i + 7));
  return out;
}
