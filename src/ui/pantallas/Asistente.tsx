import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Smartphone, Zap } from 'lucide-react';
import { hoy, proponerMetas } from '../../nucleo';
import { Boton, BotonIcono } from '../componentes/base';
import {
  AvisoOrientativo, CamposCorporales, CamposObjetivo, PanelPropuesta, borradorDe, erroresBorrador, perfilDe,
} from '../componentes/FormPerfil';
import type { BorradorPerfil } from '../componentes/FormPerfil';
import { Logo } from '../componentes/Marco';
import { useAvisos } from '../componentes/Avisos';
import * as datos from '../servicios/datos';
import { marcarAsistente } from '../primerArranque';

const PASOS = ['Tus datos', 'Tu objetivo', 'Tu meta'] as const;

/** Asistente de primer arranque: 3 pasos, omitible en cualquier momento. */
export default function Asistente() {
  const navegar = useNavigate();
  const { avisar } = useAvisos();
  const [paso, setPaso] = useState(-1);
  const [b, setB] = useState<BorradorPerfil>(() => borradorDe({}));
  const cambiar = (c: Partial<BorradorPerfil>) => setB((x) => ({ ...x, ...c }));
  const perfil = useMemo(() => perfilDe(b), [b]);
  const propuesta = useMemo(() => proponerMetas(perfil), [perfil]);
  const errores = erroresBorrador(b);

  const omitir = () => { marcarAsistente('omitido'); navegar('/', { replace: true }); };

  const terminar = async () => {
    try {
      await datos.guardarPerfil({ ...perfil, pesoInicialKg: perfil.pesoActualKg });
      if (perfil.pesoActualKg) await datos.registrarPeso({ pesoKg: perfil.pesoActualKg, fecha: hoy() });
      if (propuesta.ok) await datos.guardarMetas({ ...propuesta.metas, personalizada: false });
      marcarAsistente('hecho');
      avisar({ texto: 'Listo. Ya puedes registrar tu primera comida.', tono: 'exito' });
      navegar('/', { replace: true });
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo guardar.', tono: 'error' });
    }
  };

  const puedeSeguir = paso === 0
    ? !!b.sexo && !!perfil.edad && !!perfil.estaturaCm && !!perfil.pesoActualKg && !errores.pesoObjetivoKg
    : paso === 1 ? !!b.actividad && !!b.objetivo : true;

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex min-h-12 items-center justify-between">
        {paso >= 0 ? <BotonIcono icono={ArrowLeft} etiqueta="Paso anterior" onClick={() => setPaso(paso - 1)} className="-ml-2" /> : <span />}
        <button type="button" onClick={omitir} className="min-h-11 rounded-full px-3 font-semibold text-tinta-2 hover:bg-hundido">Omitir</button>
      </div>

      {paso === -1 ? (
        <div className="flex flex-1 flex-col">
          <div className="mt-6 flex-1">
            <Logo tam={64} />
            <h1 className="mt-6 text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.03em]">Lo que comes, anotado en segundos.</h1>
            <p className="mt-3 text-lg text-tinta-2">CALORÍA te ayuda a llevar tus calorías, macros y peso, con alimentos mexicanos y de marca.</p>
            <ul className="mt-8 space-y-4">
              <li className="flex gap-3"><Zap aria-hidden className="mt-0.5 shrink-0 text-talavera" /><span><strong>Registro rápido.</strong> Busca, toca y listo; repite tus comidas de siempre con un toque.</span></li>
              <li className="flex gap-3"><ShieldCheck aria-hidden className="mt-0.5 shrink-0 text-talavera" /><span><strong>Tus datos son tuyos.</strong> Se guardan solo en este dispositivo, sin cuenta. Haz respaldos de vez en cuando.</span></li>
              <li className="flex gap-3"><Smartphone aria-hidden className="mt-0.5 shrink-0 text-talavera" /><span><strong>Funciona sin conexión.</strong> Instálala como app desde el menú del navegador.</span></li>
            </ul>
          </div>
          <Boton ancho onClick={() => setPaso(0)} className="mt-8">Configurar mi meta</Boton>
          <p className="mt-3 text-center text-sm text-tinta-3">Toma menos de un minuto.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <ol className="mt-2 flex gap-2" aria-label="Pasos">
            {PASOS.map((p, i) => (
              <li key={p} className="flex-1" aria-current={i === paso ? 'step' : undefined}>
                <span className={`block h-1.5 rounded-full ${i <= paso ? 'bg-talavera' : 'bg-hundido'}`} aria-hidden />
                <span className={`mt-1.5 block text-xs font-semibold ${i === paso ? 'text-tinta' : 'text-tinta-3'}`}>{p}</span>
              </li>
            ))}
          </ol>
          <h1 className="mt-6 text-[1.9rem] font-bold leading-tight tracking-[-0.02em]">
            {paso === 0 ? 'Cuéntanos de ti' : paso === 1 ? '¿Qué quieres lograr?' : 'Tu meta diaria'}
          </h1>
          <p className="mt-1 text-tinta-2">
            {paso === 0 ? 'Con esto estimamos cuánta energía gastas al día.' : paso === 1 ? 'Puedes cambiarlo cuando quieras en Perfil y metas.' : 'Es un punto de partida; ajústala cuando quieras.'}
          </p>
          <div className="mt-6 flex-1">
            {paso === 0 && <CamposCorporales b={b} cambiar={cambiar} />}
            {paso === 1 && <CamposObjetivo b={b} cambiar={cambiar} />}
            {paso === 2 && (
              <div className="space-y-4">
                <PanelPropuesta propuesta={propuesta} />
                <AvisoOrientativo />
              </div>
            )}
          </div>
          <Boton ancho className="mt-6" disabled={!puedeSeguir} onClick={() => (paso < 2 ? setPaso(paso + 1) : void terminar())}>
            {paso < 2 ? 'Continuar' : 'Guardar y empezar'}
          </Boton>
        </div>
      )}
    </div>
  );
}
