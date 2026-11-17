import { useEffect, useMemo, useState } from 'react';
import { Sparkles, TriangleAlert } from 'lucide-react';
import { formatear, hoy, proponerMetas, revisarMetas } from '../../nucleo';
import { Boton, Campo, Cargando, Encabezado, Nota, Segmentado, Tarjeta, Volver } from '../componentes/base';
import {
  AvisoOrientativo, CamposCorporales, CamposObjetivo, PanelPropuesta, borradorDe, erroresBorrador, perfilDe,
} from '../componentes/FormPerfil';
import type { BorradorPerfil } from '../componentes/FormPerfil';
import { MACROS } from '../componentes/Medidores';
import { useAvisos } from '../componentes/Avisos';
import * as datos from '../servicios/datos';
import { leerNumero } from '../util';
import type { Metas, Perfil as PerfilT } from '../../tipos';

type ModoMacros = 'g' | '%';

export default function Perfil() {
  const perfil = datos.usePerfil();
  const metaVigente = datos.useMetaVigente(hoy());
  if (perfil === undefined || metaVigente === undefined) return <><Encabezado titulo="Perfil y metas" volver={<Volver a="/mas" />} /><Cargando /></>;
  return <Formulario perfilInicial={perfil} metaInicial={metaVigente} />;
}

function Formulario({ perfilInicial, metaInicial }: { perfilInicial: PerfilT; metaInicial: Metas | null }) {
  const { avisar } = useAvisos();
  const [b, setB] = useState<BorradorPerfil>(() => borradorDe(perfilInicial));
  const cambiar = (c: Partial<BorradorPerfil>) => setB((x) => ({ ...x, ...c }));
  const perfil = useMemo(() => perfilDe(b), [b]);
  const propuesta = useMemo(() => proponerMetas(perfil), [perfil]);

  const [modo, setModo] = useState<ModoMacros>('g');
  const [kcalTxt, setKcalTxt] = useState(metaInicial ? String(Math.round(metaInicial.kcal)) : '');
  const [macrosTxt, setMacrosTxt] = useState<Record<'proteina' | 'carbohidratos' | 'grasa', string>>({
    proteina: metaInicial ? String(Math.round(metaInicial.proteina)) : '',
    carbohidratos: metaInicial ? String(Math.round(metaInicial.carbohidratos)) : '',
    grasa: metaInicial ? String(Math.round(metaInicial.grasa)) : '',
  });

  // Sin meta guardada: se precarga la propuesta en cuanto exista.
  useEffect(() => {
    if (!metaInicial && propuesta.ok && !kcalTxt) usarPropuesta();
  }, [propuesta.ok]);

  const kcal = leerNumero(kcalTxt);
  const gramos = (id: 'proteina' | 'carbohidratos' | 'grasa'): number | undefined => {
    const v = leerNumero(macrosTxt[id]);
    if (v === undefined) return undefined;
    if (modo === 'g') return v;
    const m = MACROS.find((x) => x.id === id)!;
    return kcal ? (kcal * v) / 100 / m.kcalPorG : undefined;
  };
  const metasNuevas = kcal !== undefined && kcal > 0 && MACROS.every((m) => gramos(m.id) !== undefined)
    ? { kcal, proteina: gramos('proteina')!, carbohidratos: gramos('carbohidratos')!, grasa: gramos('grasa')! }
    : null;
  const sumaPct = modo === '%' ? MACROS.reduce((s, m) => s + (leerNumero(macrosTxt[m.id]) ?? 0), 0) : null;
  const avisosMetas = metasNuevas ? revisarMetas(metasNuevas, perfil.sexo) : [];

  function usarPropuesta() {
    if (!propuesta.ok) return;
    const m = propuesta.metas;
    setKcalTxt(String(m.kcal));
    if (modo === 'g') setMacrosTxt({ proteina: String(m.proteina), carbohidratos: String(m.carbohidratos), grasa: String(m.grasa) });
    else setMacrosTxt({
      proteina: String(Math.round((m.proteina * 400) / m.kcal)),
      carbohidratos: String(Math.round((m.carbohidratos * 400) / m.kcal)),
      grasa: String(Math.round((m.grasa * 900) / m.kcal)),
    });
  }

  const cambiarModo = (nuevo: ModoMacros) => {
    if (nuevo === modo) return;
    const k = kcal;
    const conv: Record<string, string> = {};
    for (const m of MACROS) {
      const v = leerNumero(macrosTxt[m.id]);
      conv[m.id] = v === undefined || !k ? '' : nuevo === '%'
        ? String(Math.round((v * m.kcalPorG * 100) / k))
        : String(Math.round((k * v) / 100 / m.kcalPorG));
    }
    setMacrosTxt(conv as typeof macrosTxt);
    setModo(nuevo);
  };

  const errores = erroresBorrador(b);
  const guardarPerfil = async () => {
    try {
      await datos.guardarPerfil({ ...perfil });
      avisar({ texto: 'Perfil guardado', tono: 'exito' });
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo guardar el perfil.', tono: 'error' });
    }
  };
  const guardarMetas = async () => {
    if (!metasNuevas) return;
    const personalizada = !propuesta.ok || Math.round(metasNuevas.kcal) !== propuesta.metas.kcal
      || MACROS.some((m) => Math.round(metasNuevas[m.id]) !== propuesta.metas[m.id]);
    try {
      await datos.guardarMetas({ ...metasNuevas, personalizada });
      avisar({ texto: 'Metas guardadas a partir de hoy', tono: 'exito' });
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudieron guardar las metas.', tono: 'error' });
    }
  };

  return (
    <div>
      <Encabezado titulo="Perfil y metas" volver={<Volver a="/mas" />} />
      <div className="grid gap-4 px-3 lg:grid-cols-2 lg:items-start lg:px-0">
        <Tarjeta className="space-y-5 p-4 sm:p-5" aria-labelledby="titulo-perfil">
          <h2 id="titulo-perfil" className="text-lg font-semibold">Tus datos</h2>
          <Campo etiqueta="Nombre (opcional)" value={b.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} autoComplete="given-name" />
          <CamposCorporales b={b} cambiar={cambiar} />
          <CamposObjetivo b={b} cambiar={cambiar} />
          <p className="text-sm text-tinta-3">El peso actual se actualiza solo cuando registras tu peso.</p>
          <Boton ancho variante="secundario" onClick={guardarPerfil} disabled={Object.keys(errores).length > 0}>Guardar perfil</Boton>
        </Tarjeta>

        <div className="space-y-4">
          <Tarjeta className="space-y-4 p-4 sm:p-5" aria-labelledby="titulo-propuesta">
            <h2 id="titulo-propuesta" className="text-lg font-semibold">Propuesta según tus datos</h2>
            <PanelPropuesta propuesta={propuesta} />
            {propuesta.ok && <Boton variante="secundario" icono={Sparkles} onClick={usarPropuesta}>Usar esta propuesta</Boton>}
          </Tarjeta>

          <Tarjeta className="space-y-4 p-4 sm:p-5" aria-labelledby="titulo-metas">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="titulo-metas" className="text-lg font-semibold">Tu meta diaria</h2>
              <Segmentado<ModoMacros> etiqueta="Macros en" valor={modo} onCambio={cambiarModo} className="w-40"
                opciones={[{ valor: 'g', texto: 'Gramos' }, { valor: '%', texto: '%' }]} />
            </div>
            {metaInicial && (
              <p className="text-sm text-tinta-3">
                Vigente desde el {metaInicial.desde}{metaInicial.personalizada ? ', ajustada por ti' : ''}. Al guardar, la nueva meta aplica desde hoy; los días anteriores conservan la suya.
              </p>
            )}
            <Campo etiqueta="Calorías" sufijo="kcal" inputMode="numeric" value={kcalTxt} onChange={(e) => setKcalTxt(e.target.value)} />
            <div className="grid grid-cols-3 gap-3">
              {MACROS.map((m) => (
                <Campo key={m.id} etiqueta={m.nombre} sufijo={modo} inputMode="decimal" value={macrosTxt[m.id]}
                  onChange={(e) => setMacrosTxt((x) => ({ ...x, [m.id]: e.target.value }))}
                  ayuda={modo === '%' && kcal ? `${formatear(gramos(m.id), 0)} g` : modo === 'g' && kcal && leerNumero(macrosTxt[m.id]) !== undefined
                    ? `${formatear(((leerNumero(macrosTxt[m.id]) ?? 0) * m.kcalPorG * 100) / kcal, 0)} %` : undefined} />
              ))}
            </div>
            {sumaPct !== null && Math.round(sumaPct) !== 100 && (
              <p className="text-sm text-exceso">Los porcentajes suman {formatear(sumaPct, 0)} %; deben sumar 100 %.</p>
            )}
            {avisosMetas.map((a) => <Nota key={a} tono="aviso" icono={TriangleAlert}>{a}</Nota>)}
            <Boton ancho onClick={guardarMetas} disabled={!metasNuevas || (sumaPct !== null && Math.round(sumaPct) !== 100)}>Guardar metas</Boton>
          </Tarjeta>
          <AvisoOrientativo />
        </div>
      </div>
    </div>
  );
}
