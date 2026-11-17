import { useMemo, useState } from 'react';
import {
  diasEntre, formatear, nombreDia, formatearFechaCorta, formatearFechaLarga, hoy, nombreMes, serieTendencia, sumarDias, sumarMeses,
} from '../../nucleo';
import type { EstadisticasRango, ResumenPeriodoEst } from '../../nucleo';
import { COMIDAS } from '../../tipos';
import { Campo, Cargando, Encabezado, Tarjeta } from '../componentes/base';
import { GraficaKcal, GraficaMacros, GraficaPeso } from '../componentes/Graficas';
import type { PuntoKcal, PuntoMacros, PuntoPesoGrafica } from '../componentes/Graficas';
import { MACROS } from '../componentes/Medidores';
import { useEstadisticas, usePesos, usePerfil } from '../servicios/datos';
import { cx, kcal } from '../util';

type Periodo = '7' | '30' | '90' | '365' | 'personalizado';

const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: '7', texto: '7 días' },
  { valor: '30', texto: '30 días' },
  { valor: '90', texto: '3 meses' },
  { valor: '365', texto: '12 meses' },
  { valor: 'personalizado', texto: 'Personalizado' },
];

function pct(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${formatear(n * 100, 0)} %`;
}

export default function Estadisticas() {
  const h = hoy();
  const [periodo, setPeriodo] = useState<Periodo>('30');
  const [desdeP, setDesdeP] = useState(sumarMeses(h, -1));
  const [hastaP, setHastaP] = useState(h);
  const desde = periodo === 'personalizado' ? (desdeP <= hastaP ? desdeP : hastaP) : sumarDias(h, -(Number(periodo) - 1));
  const hasta = periodo === 'personalizado' ? (hastaP >= desdeP ? hastaP : desdeP) : h;
  const est = useEstadisticas(desde, hasta, { hoy: h });
  const pesos = usePesos();
  const perfil = usePerfil();

  return (
    <div>
      <Encabezado titulo="Estadísticas" />
      <div className="space-y-4 px-3 lg:px-0">
        <div className="space-y-3">
          <div role="radiogroup" aria-label="Periodo" className="sin-barra -mx-3 flex gap-2 overflow-x-auto px-3 lg:mx-0 lg:px-0">
            {PERIODOS.map((p) => (
              <button key={p.valor} type="button" role="radio" aria-checked={periodo === p.valor} onClick={() => setPeriodo(p.valor)}
                className={cx('min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition',
                  periodo === p.valor ? 'border-talavera bg-talavera text-sobre-talavera' : 'border-borde bg-superficie text-tinta-2 hover:text-tinta')}>
                {p.texto}
              </button>
            ))}
          </div>
          {periodo === 'personalizado' && (
            <div className="grid max-w-md grid-cols-2 gap-3">
              <Campo etiqueta="Desde" type="date" value={desdeP} max={h} onChange={(e) => e.target.value && setDesdeP(e.target.value)} />
              <Campo etiqueta="Hasta" type="date" value={hastaP} max={h} onChange={(e) => e.target.value && setHastaP(e.target.value)} />
            </div>
          )}
          <p className="text-sm text-tinta-3">Del {formatearFechaLarga(desde)} al {formatearFechaLarga(hasta)}</p>
        </div>

        {!est ? <Cargando /> : (
          <Contenido est={est} pesos={pesos} objetivo={perfil?.pesoObjetivoKg ?? null} />
        )}
      </div>
    </div>
  );
}

function Contenido({ est, pesos, objetivo }: { est: EstadisticasRango; pesos?: { fecha: string; pesoKg: number }[]; objetivo: number | null }) {
  const dias = diasEntre(est.desde, est.hasta) + 1;
  const granularidad: 'dia' | 'semana' | 'mes' = dias <= 31 ? 'dia' : dias <= 120 ? 'semana' : 'mes';

  const { puntosKcal, puntosMacros } = useMemo(() => {
    const kc: PuntoKcal[] = [];
    const mc: PuntoMacros[] = [];
    if (granularidad === 'dia') {
      for (const d of est.serie) {
        const etiqueta = dias <= 7 ? `${nombreDia(d.fecha).slice(0, 3)} ${Number(d.fecha.slice(8))}` : formatearFechaCorta(d.fecha);
        const etiquetaLarga = formatearFechaLarga(d.fecha);
        kc.push({ etiqueta, etiquetaLarga, kcal: d.totales?.kcal, meta: d.meta?.kcal });
        mc.push({ etiqueta, etiquetaLarga, proteina: d.totales?.proteina, carbohidratos: d.totales?.carbohidratos, grasa: d.totales?.grasa });
      }
    } else {
      const periodos: (ResumenPeriodoEst & { mes?: string })[] = granularidad === 'semana' ? est.semanas : est.meses;
      for (const p of periodos) {
        const etiqueta = granularidad === 'semana' ? formatearFechaCorta(p.inicio) : nombreMes(p.mes!).slice(0, 3);
        const etiquetaLarga = granularidad === 'semana'
          ? `Semana del ${formatearFechaCorta(p.inicio)} al ${formatearFechaCorta(p.fin)} (promedio diario)`
          : `${nombreMes(p.mes!)} ${p.mes!.slice(0, 4)} (promedio diario)`;
        kc.push({ etiqueta, etiquetaLarga, kcal: p.promedio?.kcal, meta: p.metaKcalPromedio ?? undefined });
        mc.push({ etiqueta, etiquetaLarga, proteina: p.promedio?.proteina, carbohidratos: p.promedio?.carbohidratos, grasa: p.promedio?.grasa });
      }
    }
    return { puntosKcal: kc, puntosMacros: mc };
  }, [est, granularidad, dias]);

  const puntosPeso: PuntoPesoGrafica[] = useMemo(() => {
    if (!pesos) return [];
    return serieTendencia(pesos)
      .filter((p) => p.fecha >= est.desde && p.fecha <= est.hasta)
      .map((p) => ({ etiqueta: formatearFechaCorta(p.fecha), etiquetaLarga: formatearFechaLarga(p.fecha), peso: p.pesoKg, tendencia: p.tendenciaKg }));
  }, [pesos, est.desde, est.hasta]);

  const prom = est.promedio;
  const kcalMacros = prom ? prom.proteina * 4 + prom.carbohidratos * 4 + prom.grasa * 9 : 0;
  const textoGranularidad = granularidad === 'dia' ? 'Por día' : granularidad === 'semana' ? 'Promedio diario de cada semana' : 'Promedio diario de cada mes';
  const periodosCumplimiento = granularidad === 'mes' ? est.meses : est.semanas;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Promedio diario" valor={prom ? `${kcal(prom.kcal)}` : '—'} unidad="kcal"
          nota={est.metaKcalPromedio ? `Meta: ${kcal(est.metaKcalPromedio)} kcal` : 'Sin meta definida'} principal />
        <Indicador titulo="Días registrados" valor={String(est.diasRegistrados)} unidad={`de ${est.diasPeriodo}`}
          nota={`Racha actual: ${est.rachaActual} ${est.rachaActual === 1 ? 'día' : 'días'}`} />
        <Indicador titulo="Cumplimiento" valor={pct(est.cumplimiento)}
          nota={est.diasConMeta ? `${est.diasCumplidos} de ${est.diasConMeta} ${est.diasConMeta === 1 ? 'día' : 'días'} a ±10 % de la meta` : 'Sin días con meta'} />
        <Indicador titulo="Racha más larga" valor={String(est.rachaMaxima)} unidad={est.rachaMaxima === 1 ? 'día' : 'días'} nota="Días seguidos con registro" />
      </div>

      <Tarjeta className="p-4 sm:p-5" aria-labelledby="titulo-macros-prom">
        <h2 id="titulo-macros-prom" className="text-lg font-semibold">Macros promedio por día</h2>
        <p className="text-sm text-tinta-2">La barra muestra qué parte de las calorías viene de cada macro.</p>
        {prom ? (
          <>
            <div className="mt-3 flex h-7 gap-[2px] overflow-hidden rounded-[4px]" role="img"
              aria-label={MACROS.map((m) => `${m.nombre} ${formatear(kcalMacros ? (prom[m.id] * m.kcalPorG * 100) / kcalMacros : 0, 0)} %`).join(', ')}>
              {MACROS.map((m) => {
                const parte = kcalMacros ? (prom[m.id] * m.kcalPorG) / kcalMacros : 0;
                return parte > 0 ? (
                  <div key={m.id} className={cx('flex items-center rounded-[4px] px-2 text-xs font-bold', m.fondo, m.sobre)} style={{ width: `${parte * 100}%` }}>
                    {parte > 0.12 ? `${formatear(parte * 100, 0)} %` : ''}
                  </div>
                ) : null;
              })}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              {MACROS.map((m) => (
                <div key={m.id}>
                  <dt className="flex items-center gap-1.5 text-sm text-tinta-2"><span className={cx('size-2.5 rounded-sm', m.fondo)} aria-hidden />{m.nombre}</dt>
                  <dd className="font-display text-xl font-semibold cifras">{formatear(prom[m.id], 0)} g</dd>
                </div>
              ))}
            </dl>
          </>
        ) : <p className="mt-2 text-tinta-3">Registra comidas para ver tus promedios.</p>}
      </Tarjeta>

      <div className="grid gap-4 xl:grid-cols-2">
        <GraficaKcal titulo="Calorías y meta" descripcion={textoGranularidad} datos={puntosKcal} />
        <GraficaMacros titulo="Macronutrientes" descripcion={`${textoGranularidad}, en gramos`} datos={puntosMacros} />
      </div>
      <GraficaPeso titulo="Peso y tendencia" descripcion="Puntos: peso de cada día. Línea: tendencia suavizada." datos={puntosPeso} objetivo={objetivo} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta className="p-4 sm:p-5" aria-labelledby="titulo-cumplimiento">
          <h2 id="titulo-cumplimiento" className="mb-2 text-lg font-semibold">Cumplimiento {granularidad === 'mes' ? 'mensual' : 'semanal'}</h2>
          <table className="w-full text-sm cifras">
            <thead className="text-left text-tinta-3">
              <tr>
                <th scope="col" className="py-2 font-semibold">{granularidad === 'mes' ? 'Mes' : 'Semana'}</th>
                <th scope="col" className="py-2 text-right font-semibold">Días</th>
                <th scope="col" className="py-2 text-right font-semibold">Promedio</th>
                <th scope="col" className="py-2 text-right font-semibold">Cumplió</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {[...periodosCumplimiento].reverse().map((p) => (
                <tr key={p.inicio}>
                  <th scope="row" className="py-2 text-left font-normal first-letter:uppercase">
                    {'mes' in p && p.mes ? `${nombreMes(p.mes as string)} ${(p.mes as string).slice(0, 4)}` : `${formatearFechaCorta(p.inicio)} al ${formatearFechaCorta(p.fin)}`}
                  </th>
                  <td className="py-2 text-right">{p.diasRegistrados}/{p.diasPeriodo}</td>
                  <td className="py-2 text-right">{p.promedio ? `${kcal(p.promedio.kcal)} kcal` : '—'}</td>
                  <td className="py-2 text-right font-semibold">{pct(p.cumplimiento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>

        <Tarjeta className="p-4 sm:p-5" aria-labelledby="titulo-por-comida">
          <h2 id="titulo-por-comida" className="mb-3 text-lg font-semibold">Promedio por comida</h2>
          {est.diasRegistrados ? (
            <ul className="space-y-3">
              {COMIDAS.map((c) => {
                const v = est.promedioPorComida[c.id].kcal;
                const max = Math.max(1, ...COMIDAS.map((x) => est.promedioPorComida[x.id].kcal));
                return (
                  <li key={c.id}>
                    <div className="flex justify-between text-sm"><span>{c.nombre}</span><span className="font-semibold cifras">{kcal(v)} kcal</span></div>
                    <div className="mt-1 h-2 rounded-full bg-hundido"><div className="h-full rounded-full bg-grafica-kcal" style={{ width: `${(v / max) * 100}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-tinta-3">Sin días registrados en este periodo.</p>}
        </Tarjeta>
      </div>
    </>
  );
}

function Indicador({ titulo, valor, unidad, nota, principal }: { titulo: string; valor: string; unidad?: string; nota?: string; principal?: boolean }) {
  return (
    <Tarjeta as="div" className={cx('p-4', principal && 'border-talavera/30')}>
      <p className="text-sm text-tinta-2">{titulo}</p>
      <p className="mt-0.5 font-display text-[1.8rem] font-bold leading-tight tracking-[-0.02em]">
        {valor}{unidad && <span className="ml-1 text-base font-semibold text-tinta-3">{unidad}</span>}
      </p>
      {nota && <p className="mt-0.5 text-xs text-tinta-3">{nota}</p>}
    </Tarjeta>
  );
}
