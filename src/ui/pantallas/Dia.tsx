import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Target } from 'lucide-react';
import {
  describirCantidad, esFechaValida, formatear, formatearFechaLarga, hoy, nombreDia, sumarDias,
} from '../../nucleo';
import type { ResumenDia } from '../../nucleo';
import type { ComidaId, RegistroComida } from '../../tipos';
import { COMIDAS } from '../../tipos';
import { BotonIcono, Cargando, Nota, Tarjeta } from '../componentes/base';
import { AnilloKcal, BarraMacro, MacrosEnLinea } from '../componentes/Medidores';
import { useRegistro } from '../registro/ContextoRegistro';
import { useDia, usePesoDeFecha } from '../servicios/datos';
import { cx, kcal } from '../util';

function tituloDia(fecha: string): string {
  const h = hoy();
  if (fecha === h) return 'Hoy';
  if (fecha === sumarDias(h, -1)) return 'Ayer';
  if (fecha === sumarDias(h, 1)) return 'Mañana';
  const n = nombreDia(fecha);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export default function Dia() {
  const [params, setParams] = useSearchParams();
  const fechaParam = params.get('fecha');
  const fecha = fechaParam && esFechaValida(fechaParam) ? fechaParam : hoy();
  const resumen = useDia(fecha);
  const peso = usePesoDeFecha(fecha);
  const { setFechaVista, abrirRegistro, editarRegistro } = useRegistro();

  useEffect(() => { setFechaVista(fecha); return () => setFechaVista(hoy()); }, [fecha, setFechaVista]);

  const irA = (f: string) => {
    if (f === hoy()) params.delete('fecha'); else params.set('fecha', f);
    setParams(params, { replace: true });
  };

  const fechaLarga = formatearFechaLarga(fecha);

  return (
    <div>
      <header className="flex items-center gap-1 px-2 pb-2 pt-3 lg:px-0 lg:pt-8">
        <BotonIcono icono={ChevronLeft} etiqueta="Día anterior" onClick={() => irA(sumarDias(fecha, -1))} />
        <div className="min-w-0 flex-1 text-center lg:text-left">
          <h1 className="text-[1.6rem] font-bold leading-tight tracking-[-0.02em] lg:text-[2.1rem]">{tituloDia(fecha)}</h1>
          <p className="text-sm text-tinta-2 first-letter:uppercase">{fechaLarga}</p>
        </div>
        <BotonIcono icono={ChevronRight} etiqueta="Día siguiente" onClick={() => irA(sumarDias(fecha, 1))} />
        <Link to="/calendario" aria-label="Abrir calendario" title="Abrir calendario"
          className="flex size-11 items-center justify-center rounded-full text-tinta-2 hover:bg-hundido hover:text-tinta">
          <CalendarDays aria-hidden size={22} />
        </Link>
      </header>
      {fecha !== hoy() && (
        <div className="px-4 pb-2 text-center lg:px-0 lg:text-left">
          <button type="button" onClick={() => irA(hoy())} className="min-h-10 rounded-full bg-talavera-tinte px-4 text-sm font-semibold text-talavera">
            Volver a hoy
          </button>
        </div>
      )}

      {!resumen ? <Cargando /> : (
        <div className="grid gap-4 px-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-0">
          <Resumen resumen={resumen} pesoKg={peso?.pesoKg} />
          <Comidas resumen={resumen} onAgregar={(c) => abrirRegistro({ fecha, comida: c })} onEditar={editarRegistro} />
        </div>
      )}
    </div>
  );
}

function Resumen({ resumen, pesoKg }: { resumen: ResumenDia; pesoKg?: number }) {
  const { totales, meta } = resumen;
  const cumplimiento = meta && meta.kcal > 0 ? totales.kcal / meta.kcal : null;
  return (
    <Tarjeta className="p-4 sm:p-5 lg:sticky lg:top-8" aria-label="Resumen del día">
      <div className="flex items-center gap-4 lg:flex-col lg:items-stretch">
        <div className="lg:self-center"><AnilloKcal consumido={totales.kcal} meta={meta?.kcal ?? null} tam={168} /></div>
        <dl className="grid flex-1 gap-3 lg:grid-cols-3 lg:gap-2 lg:text-center">
          <div>
            <dt className="text-sm text-tinta-2">Consumidas</dt>
            <dd className="font-display text-xl font-semibold cifras">{kcal(totales.kcal)}</dd>
          </div>
          <div>
            <dt className="text-sm text-tinta-2">Meta</dt>
            <dd className="font-display text-xl font-semibold cifras">{meta ? kcal(meta.kcal) : '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-tinta-2">Cumplimiento</dt>
            <dd className={cx('font-display text-xl font-semibold cifras', cumplimiento !== null && cumplimiento > 1.1 && 'text-exceso')}>
              {cumplimiento !== null ? `${formatear(cumplimiento * 100, 0)} %` : '—'}
            </dd>
          </div>
        </dl>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4 lg:hidden">
        <BarraMacro macro="proteina" valor={totales.proteina} meta={meta?.proteina ?? null} compacta />
        <BarraMacro macro="carbohidratos" valor={totales.carbohidratos} meta={meta?.carbohidratos ?? null} compacta />
        <BarraMacro macro="grasa" valor={totales.grasa} meta={meta?.grasa ?? null} compacta />
      </div>
      <div className="mt-6 hidden space-y-4 lg:block">
        <BarraMacro macro="proteina" valor={totales.proteina} meta={meta?.proteina ?? null} />
        <BarraMacro macro="carbohidratos" valor={totales.carbohidratos} meta={meta?.carbohidratos ?? null} />
        <BarraMacro macro="grasa" valor={totales.grasa} meta={meta?.grasa ?? null} />
      </div>
      {!meta && (
        <Nota icono={Target} className="mt-4">
          Aún no tienes una meta diaria. <Link to="/mas/perfil" className="font-semibold text-talavera underline underline-offset-2">Calcula tu meta</Link> para ver cuánto te queda.
        </Nota>
      )}
      {pesoKg !== undefined && (
        <p className="mt-4 border-t border-borde pt-3 text-sm text-tinta-2">
          Peso registrado este día: <Link to="/peso" className="font-semibold text-tinta underline-offset-2 hover:underline cifras">{formatear(pesoKg, 1)} kg</Link>
        </p>
      )}
    </Tarjeta>
  );
}

function Comidas({ resumen, onAgregar, onEditar }: {
  resumen: ResumenDia; onAgregar: (c: ComidaId) => void; onEditar: (r: RegistroComida) => void;
}) {
  return (
    <Tarjeta className="overflow-hidden" aria-label="Comidas del día">
      <ol className="divide-y divide-borde">
        {COMIDAS.map(({ id, nombre }) => {
          const { registros, totales } = resumen.porComida[id];
          return (
            <li key={id} aria-labelledby={`comida-${id}`}>
              <div className="flex items-center gap-2 py-1.5 pl-4 pr-1.5">
                <div className="min-w-0 flex-1 py-1">
                  <h2 id={`comida-${id}`} className="text-[1.05rem] font-semibold">{nombre}</h2>
                  {registros.length > 0 && <MacrosEnLinea p={totales.proteina} c={totales.carbohidratos} g={totales.grasa} />}
                </div>
                {registros.length > 0 && (
                  <span className="text-sm font-semibold text-tinta-2 cifras">{kcal(totales.kcal)} kcal</span>
                )}
                <BotonIcono icono={Plus} etiqueta={`Agregar a ${nombre}`} tono="talavera" onClick={() => onAgregar(id)} />
              </div>
              {registros.length > 0 && (
                <ul className="pb-2">
                  {registros.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => onEditar(r)}
                        aria-label={`${r.instantanea.nombre}, ${describirCantidad(r.cantidad, r.unidad, r.porcionEtiqueta)}, ${kcal(r.totales.kcal)} kcal. Editar`}
                        className="flex min-h-14 w-full items-center gap-3 px-4 py-1.5 text-left hover:bg-hundido/60">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{r.instantanea.nombre}</span>
                          <span className="block truncate text-sm text-tinta-3">
                            {[r.instantanea.marca, describirCantidad(r.cantidad, r.unidad, r.porcionEtiqueta)].filter(Boolean).join(', ')}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold cifras">{kcal(r.totales.kcal)}</span>
                          <MacrosEnLinea p={r.totales.proteina} c={r.totales.carbohidratos} g={r.totales.grasa} className="hidden sm:inline-flex" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {!resumen.registrado && (
        <p className="border-t border-borde px-4 py-3 text-sm text-tinta-3">
          Toca + en una comida para registrar lo que comiste.
        </p>
      )}
    </Tarjeta>
  );
}
