import { Info, TriangleAlert } from 'lucide-react';
import { AVISO_CONSULTA, AVISO_ORIENTATIVO, NIVELES_ACTIVIDAD, RITMO_MAXIMO, formatear, proponerMetas } from '../../nucleo';
import type { ResultadoPropuesta } from '../../nucleo';
import type { NivelActividad, Objetivo, Perfil, Sexo } from '../../tipos';
import { Campo, Nota, Segmentado, Selector } from './base';
import { MACROS } from './Medidores';
import { leerNumero } from '../util';

/** Borrador de perfil con los números como texto (para editar sin perder lo que se teclea). */
export interface BorradorPerfil {
  nombre: string;
  edad: string;
  sexo?: Sexo;
  estaturaCm: string;
  pesoActualKg: string;
  pesoObjetivoKg: string;
  actividad?: NivelActividad;
  objetivo?: Objetivo;
  ritmoKgSemana: string;
}

export function borradorDe(p: Perfil): BorradorPerfil {
  const t = (n?: number) => (n === undefined ? '' : String(n));
  return {
    nombre: p.nombre ?? '',
    edad: t(p.edad),
    sexo: p.sexo,
    estaturaCm: t(p.estaturaCm),
    pesoActualKg: t(p.pesoActualKg),
    pesoObjetivoKg: t(p.pesoObjetivoKg),
    actividad: p.actividad,
    objetivo: p.objetivo,
    ritmoKgSemana: t(p.ritmoKgSemana),
  };
}

const RANGOS = {
  edad: [12, 110], estaturaCm: [100, 250], pesoActualKg: [20, 400], pesoObjetivoKg: [20, 400], ritmoKgSemana: [0, 1],
} as const;

export function erroresBorrador(b: BorradorPerfil): Partial<Record<keyof typeof RANGOS, string>> {
  const e: Partial<Record<keyof typeof RANGOS, string>> = {};
  for (const [k, [min, max]] of Object.entries(RANGOS) as [keyof typeof RANGOS, readonly [number, number]][]) {
    const texto = b[k];
    if (!texto.trim()) continue;
    const n = leerNumero(texto);
    if (n === undefined || n < min || n > max) e[k] = `Entre ${min} y ${max}`;
  }
  return e;
}

/** Convierte el borrador en Perfil (campos vacíos o inválidos = undefined). */
export function perfilDe(b: BorradorPerfil): Perfil {
  const errores = erroresBorrador(b);
  const n = (k: keyof typeof RANGOS) => (errores[k] ? undefined : leerNumero(b[k]));
  return {
    nombre: b.nombre.trim() || undefined,
    edad: n('edad') !== undefined ? Math.round(n('edad')!) : undefined,
    sexo: b.sexo,
    estaturaCm: n('estaturaCm'),
    pesoActualKg: n('pesoActualKg'),
    pesoObjetivoKg: n('pesoObjetivoKg'),
    actividad: b.actividad,
    objetivo: b.objetivo,
    ritmoKgSemana: b.objetivo === 'mantener' ? undefined : n('ritmoKgSemana'),
  };
}

type Cambiar = (c: Partial<BorradorPerfil>) => void;

export function CamposCorporales({ b, cambiar }: { b: BorradorPerfil; cambiar: Cambiar }) {
  const e = erroresBorrador(b);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-tinta-2" id="etq-sexo">Sexo (para la fórmula de gasto energético)</p>
        <Segmentado<Sexo> etiqueta="Sexo" valor={b.sexo} onCambio={(sexo) => cambiar({ sexo })}
          opciones={[{ valor: 'mujer', texto: 'Mujer' }, { valor: 'hombre', texto: 'Hombre' }]} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Edad" sufijo="años" inputMode="numeric" value={b.edad} onChange={(x) => cambiar({ edad: x.target.value })} error={e.edad} />
        <Campo etiqueta="Estatura" sufijo="cm" inputMode="decimal" value={b.estaturaCm} onChange={(x) => cambiar({ estaturaCm: x.target.value })} error={e.estaturaCm} />
        <Campo etiqueta="Peso actual" sufijo="kg" inputMode="decimal" value={b.pesoActualKg} onChange={(x) => cambiar({ pesoActualKg: x.target.value })} error={e.pesoActualKg} />
        <Campo etiqueta="Peso objetivo" sufijo="kg" inputMode="decimal" value={b.pesoObjetivoKg} onChange={(x) => cambiar({ pesoObjetivoKg: x.target.value })} error={e.pesoObjetivoKg} />
      </div>
    </div>
  );
}

export function CamposObjetivo({ b, cambiar }: { b: BorradorPerfil; cambiar: Cambiar }) {
  const nivel = NIVELES_ACTIVIDAD.find((n) => n.id === b.actividad);
  const maximo = b.objetivo ? RITMO_MAXIMO[b.objetivo] : 0;
  const ritmos = [0.25, 0.5, 0.75, 1].filter((r) => r <= maximo);
  return (
    <div className="space-y-4">
      <Selector etiqueta="Nivel de actividad" value={b.actividad ?? ''} onChange={(x) => cambiar({ actividad: (x.target.value || undefined) as NivelActividad | undefined })}
        ayuda={nivel?.descripcion}>
        <option value="">Elige uno</option>
        {NIVELES_ACTIVIDAD.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
      </Selector>
      <div>
        <p className="mb-1.5 text-sm font-semibold text-tinta-2">Objetivo</p>
        <Segmentado<Objetivo> etiqueta="Objetivo" valor={b.objetivo} onCambio={(objetivo) => cambiar({ objetivo, ritmoKgSemana: objetivo === 'mantener' ? '' : b.ritmoKgSemana || String(objetivo === 'perder' ? 0.5 : 0.25) })}
          opciones={[{ valor: 'perder', texto: 'Bajar' }, { valor: 'mantener', texto: 'Mantener' }, { valor: 'ganar', texto: 'Subir' }]} />
      </div>
      {b.objetivo && b.objetivo !== 'mantener' && (
        <Selector etiqueta={`Ritmo para ${b.objetivo === 'perder' ? 'bajar' : 'subir'}`} value={b.ritmoKgSemana} onChange={(x) => cambiar({ ritmoKgSemana: x.target.value })}
          ayuda={b.objetivo === 'perder' ? 'Un ritmo de 0.5 kg por semana es sostenible para la mayoría.' : 'Subir despacio ayuda a ganar más músculo que grasa.'}>
          {ritmos.map((r) => <option key={r} value={String(r)}>{formatear(r, 2)} kg por semana</option>)}
        </Selector>
      )}
    </div>
  );
}

/** Muestra TMB, GET y la propuesta del motor (no calcula nada por su cuenta). */
export function PanelPropuesta({ propuesta }: { propuesta: ResultadoPropuesta }) {
  if (!propuesta.ok) {
    return <Nota icono={Info}>{propuesta.mensaje}</Nota>;
  }
  const { metas } = propuesta;
  const avisos = propuesta.avisos.filter((a) => a !== AVISO_ORIENTATIVO);
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 rounded-tarjeta bg-hundido p-4">
        <div>
          <dt className="text-sm text-tinta-2">Metabolismo basal (TMB)</dt>
          <dd className="font-display text-xl font-semibold cifras">{formatear(propuesta.tmb, 0)} kcal</dd>
        </div>
        <div>
          <dt className="text-sm text-tinta-2">Gasto diario (GET)</dt>
          <dd className="font-display text-xl font-semibold cifras">{formatear(propuesta.get, 0)} kcal</dd>
        </div>
        <div className="col-span-2 border-t border-borde pt-3">
          <dt className="text-sm text-tinta-2">Propuesta diaria</dt>
          <dd className="font-display text-[2rem] font-bold leading-tight tracking-[-0.02em]">{formatear(metas.kcal, 0)} kcal</dd>
          <dd className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-tinta-2">
            {MACROS.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${m.fondo}`} aria-hidden />{m.nombre} <strong className="text-tinta cifras">{formatear(metas[m.id], 0)} g</strong>
              </span>
            ))}
          </dd>
          {propuesta.ajusteDiarioKcal !== 0 && (
            <dd className="mt-1 text-xs text-tinta-3 cifras">
              {propuesta.ajusteDiarioKcal < 0 ? 'Déficit' : 'Superávit'} de {formatear(Math.abs(propuesta.ajusteDiarioKcal), 0)} kcal al día para {formatear(propuesta.ritmoKgSemana, 2)} kg por semana.
            </dd>
          )}
        </div>
      </dl>
      {avisos.map((a) => <Nota key={a} tono="aviso" icono={TriangleAlert}>{a}</Nota>)}
    </div>
  );
}

export function AvisoOrientativo() {
  return (
    <div className="space-y-2 text-sm text-tinta-3">
      <p>{AVISO_ORIENTATIVO}</p>
      <p>{AVISO_CONSULTA}</p>
    </div>
  );
}

export { proponerMetas };
