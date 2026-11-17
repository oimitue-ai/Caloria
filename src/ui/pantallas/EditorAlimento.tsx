import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { formatear, validarEnergia } from '../../nucleo';
import type { Alimento, BaseNutricional, Nutrientes, Porcion, UnidadId } from '../../tipos';
import { AreaTexto, Boton, BotonIcono, Campo, Cargando, Encabezado, Nota, Segmentado, Selector, Tarjeta, Volver } from '../componentes/base';
import { useAvisos } from '../componentes/Avisos';
import * as datos from '../servicios/datos';
import { leerNumero } from '../util';

type Clave = 'kcal' | 'proteina' | 'carbohidratos' | 'grasa' | 'grasaSaturada' | 'fibra' | 'azucares' | 'sodio';
const CAMPOS: { clave: Clave; nombre: string; unidad: string; principal?: boolean }[] = [
  { clave: 'kcal', nombre: 'Calorías', unidad: 'kcal', principal: true },
  { clave: 'proteina', nombre: 'Proteína', unidad: 'g', principal: true },
  { clave: 'carbohidratos', nombre: 'Carbohidratos', unidad: 'g', principal: true },
  { clave: 'grasa', nombre: 'Grasa', unidad: 'g', principal: true },
  { clave: 'grasaSaturada', nombre: 'Grasa saturada', unidad: 'g' },
  { clave: 'fibra', nombre: 'Fibra', unidad: 'g' },
  { clave: 'azucares', nombre: 'Azúcares', unidad: 'g' },
  { clave: 'sodio', nombre: 'Sodio', unidad: 'mg' },
];

const UNIDADES_PORCION: { id: UnidadId; nombre: string }[] = [
  { id: 'pieza', nombre: 'Pieza' }, { id: 'porcion', nombre: 'Porción' }, { id: 'taza', nombre: 'Taza' },
  { id: 'cucharada', nombre: 'Cucharada' }, { id: 'cucharadita', nombre: 'Cucharadita' },
];

interface FilaPorcion { etiqueta: string; unidad: UnidadId; equivalencia: string; predeterminada: boolean }

export default function EditorAlimento() {
  const { id: idParam = 'nuevo' } = useParams();
  const id = decodeURIComponent(idParam);
  const esNuevo = id === 'nuevo';
  const [alimento, setAlimento] = useState<Alimento | null | undefined>(esNuevo ? null : undefined);
  useEffect(() => {
    if (!esNuevo) void datos.obtenerAlimentoUsuario(id).then((a) => setAlimento(a ?? null));
  }, [id, esNuevo]);
  if (alimento === undefined) return <Cargando />;
  if (!esNuevo && alimento === null) {
    return <><Encabezado titulo="Alimento no encontrado" volver={<Volver a="/mas/alimentos" />} /><p className="px-4 text-tinta-2">Quizá lo eliminaste.</p></>;
  }
  return <Formulario alimento={alimento} />;
}

function Formulario({ alimento }: { alimento: Alimento | null }) {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const { avisar, confirmar } = useAvisos();
  const [nombre, setNombre] = useState(alimento?.nombre ?? params.get('nombre') ?? '');
  const [marca, setMarca] = useState(alimento?.marca ?? '');
  const [codigo, setCodigo] = useState(alimento?.codigoBarras ?? params.get('codigo') ?? '');
  const [base, setBase] = useState<BaseNutricional>(alimento?.base ?? 'g');
  const [modo, setModo] = useState<'100' | 'porcion'>('100');
  const [tamPorcion, setTamPorcion] = useState('');
  const [etqPorcion, setEtqPorcion] = useState('');
  const [valores, setValores] = useState<Record<Clave, string>>(() => {
    const r = {} as Record<Clave, string>;
    for (const c of CAMPOS) r[c.clave] = alimento?.nutrientes[c.clave] !== undefined ? String(alimento.nutrientes[c.clave]) : '';
    return r;
  });
  const [porciones, setPorciones] = useState<FilaPorcion[]>(() => (alimento?.porciones ?? []).map((p) => ({
    etiqueta: p.etiqueta, unidad: p.unidad, equivalencia: String(p.equivalencia), predeterminada: !!p.predeterminada,
  })));
  const [notas, setNotas] = useState(alimento?.notas ?? '');
  const [guardando, setGuardando] = useState(false);

  const tam = leerNumero(tamPorcion);
  const factor = modo === '100' ? 1 : tam && tam > 0 ? 100 / tam : undefined;
  const nutrientes: Nutrientes = {};
  for (const c of CAMPOS) {
    const v = leerNumero(valores[c.clave]);
    if (v !== undefined && factor !== undefined) nutrientes[c.clave] = Math.round(v * factor * 1000) / 1000;
  }
  const energia = validarEnergia(nutrientes);
  const negativos = CAMPOS.some((c) => (leerNumero(valores[c.clave]) ?? 0) < 0);
  const porcionesValidas = porciones.every((p) => p.etiqueta.trim() && (leerNumero(p.equivalencia) ?? 0) > 0);
  const valido = nombre.trim() && nutrientes.kcal !== undefined && factor !== undefined && !negativos && porcionesValidas
    && (modo === '100' || etqPorcion.trim());

  const guardar = async () => {
    if (!valido) return;
    setGuardando(true);
    const lista: Porcion[] = porciones.map((p) => ({
      etiqueta: p.etiqueta.trim(), unidad: p.unidad, equivalencia: leerNumero(p.equivalencia)!, ...(p.predeterminada ? { predeterminada: true } : {}),
    }));
    if (modo === 'porcion' && tam) {
      const etiqueta = `${etqPorcion.trim()} (${formatear(tam, 0)} ${base})`;
      lista.forEach((p) => { delete p.predeterminada; });
      lista.unshift({ etiqueta, unidad: 'porcion', equivalencia: tam, predeterminada: true });
    }
    const d: datos.DatosAlimentoUsuario = {
      nombre: nombre.trim(), base, nutrientes, porciones: lista,
      marca: marca.trim() || undefined, codigoBarras: codigo.trim() || undefined, notas: notas.trim() || undefined,
    };
    try {
      if (alimento) await datos.editarAlimentoUsuario(alimento.id, d);
      else await datos.crearAlimentoUsuario(d);
      avisar({ texto: alimento ? 'Alimento actualizado' : 'Alimento creado; ya puedes buscarlo al registrar', tono: 'exito' });
      navegar('/mas/alimentos');
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo guardar.', tono: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!alimento) return;
    const ok = await confirmar({
      titulo: `¿Eliminar “${alimento.nombre}”?`,
      texto: 'Lo que ya registraste con este alimento se conserva tal como está.',
      confirmar: 'Eliminar', peligro: true,
    });
    if (!ok) return;
    await datos.eliminarAlimentoUsuario(alimento.id);
    avisar({ texto: 'Alimento eliminado' });
    navegar('/mas/alimentos');
  };

  const cambiarPorcion = (i: number, c: Partial<FilaPorcion>) =>
    setPorciones((l) => l.map((p, j) => (j === i ? { ...p, ...c } : c.predeterminada ? { ...p, predeterminada: false } : p)));

  return (
    <div>
      <Encabezado titulo={alimento ? 'Editar alimento' : 'Nuevo alimento'} volver={<Volver a="/mas/alimentos" />}
        acciones={alimento ? <BotonIcono icono={Trash2} etiqueta="Eliminar alimento" tono="peligro" onClick={eliminar} /> : undefined} />
      <form className="grid gap-4 px-3 lg:grid-cols-2 lg:items-start lg:px-0" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <div className="space-y-4">
          <Tarjeta className="space-y-4 p-4 sm:p-5" aria-label="Datos generales">
            <Campo etiqueta="Nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tostadas horneadas" />
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Marca (opcional)" value={marca} onChange={(e) => setMarca(e.target.value)} />
              <Campo etiqueta="Código de barras" inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} maxLength={14} />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-tinta-2">Se mide en</p>
              <Segmentado<BaseNutricional> etiqueta="Se mide en" valor={base} onCambio={setBase}
                opciones={[{ valor: 'g', texto: 'Gramos (sólido)' }, { valor: 'ml', texto: 'Mililitros (líquido)' }]} />
            </div>
            <AreaTexto etiqueta="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Tarjeta>

          <Tarjeta className="space-y-3 p-4 sm:p-5" aria-labelledby="titulo-porciones">
            <div className="flex items-center justify-between">
              <h2 id="titulo-porciones" className="text-lg font-semibold">Porciones</h2>
              <Boton chico variante="secundario" icono={Plus} onClick={() => setPorciones((l) => [...l, { etiqueta: '', unidad: 'pieza', equivalencia: '', predeterminada: l.length === 0 }])}>Agregar</Boton>
            </div>
            <p className="text-sm text-tinta-3">Medidas caseras para registrar más rápido, por ejemplo “1 pieza” = 30 {base}.</p>
            {porciones.map((p, i) => (
              <fieldset key={i} className="space-y-2 rounded-control border border-borde p-3">
                <legend className="sr-only">Porción {i + 1}</legend>
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
                  <Campo etiqueta="Nombre" value={p.etiqueta} onChange={(e) => cambiarPorcion(i, { etiqueta: e.target.value })} placeholder="1 pieza" />
                  <Selector etiqueta="Tipo" value={p.unidad} onChange={(e) => cambiarPorcion(i, { unidad: e.target.value as UnidadId })}>
                    {UNIDADES_PORCION.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </Selector>
                </div>
                <div className="flex items-end gap-2">
                  <Campo className="flex-1" etiqueta="Equivale a" sufijo={base} inputMode="decimal" value={p.equivalencia} onChange={(e) => cambiarPorcion(i, { equivalencia: e.target.value })} />
                  <label className="flex min-h-12 items-center gap-2 px-1 text-sm">
                    <input type="radio" name="predeterminada" checked={p.predeterminada} onChange={() => cambiarPorcion(i, { predeterminada: true })} className="size-5 accent-[var(--c-talavera)]" />
                    Sugerida
                  </label>
                  <BotonIcono icono={Trash2} etiqueta={`Quitar porción ${i + 1}`} tono="peligro" onClick={() => setPorciones((l) => l.filter((_, j) => j !== i))} />
                </div>
              </fieldset>
            ))}
          </Tarjeta>
        </div>

        <Tarjeta className="space-y-4 p-4 sm:p-5" aria-labelledby="titulo-nutrientes">
          <h2 id="titulo-nutrientes" className="text-lg font-semibold">Información nutrimental</h2>
          <Segmentado<'100' | 'porcion'> etiqueta="Valores por" valor={modo} onCambio={setModo}
            opciones={[{ valor: '100', texto: `Por 100 ${base}` }, { valor: 'porcion', texto: 'Por porción (etiqueta)' }]} />
          {modo === 'porcion' && (
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Porción de la etiqueta" value={etqPorcion} onChange={(e) => setEtqPorcion(e.target.value)} placeholder="1 paquete" />
              <Campo etiqueta="Tamaño" sufijo={base} inputMode="decimal" value={tamPorcion} onChange={(e) => setTamPorcion(e.target.value)} placeholder="40" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {CAMPOS.map((c) => (
              <Campo key={c.clave} etiqueta={c.principal ? c.nombre : `${c.nombre} (opcional)`} sufijo={c.unidad} inputMode="decimal"
                value={valores[c.clave]} onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
                required={c.clave === 'kcal'} />
            ))}
          </div>
          <p className="text-sm text-tinta-3">Deja vacío lo que la etiqueta no indique: se guardará como dato faltante, no como cero.</p>
          {modo === 'porcion' && factor !== undefined && nutrientes.kcal !== undefined && (
            <p className="text-sm text-tinta-2 cifras">Se guardará como {formatear(nutrientes.kcal, 0)} kcal por 100 {base}.</p>
          )}
          {!energia.coherente && (
            <Nota tono="aviso" icono={TriangleAlert}>
              Las calorías ({formatear(energia.kcalDeclaradas, 0)} kcal) no cuadran con los macros (≈ {formatear(energia.kcalEstimadas, 0)} kcal). Revisa que no falte o sobre algún dígito.
            </Nota>
          )}
          <Boton type="submit" ancho disabled={!valido || guardando}>{alimento ? 'Guardar cambios' : 'Crear alimento'}</Boton>
        </Tarjeta>
      </form>
    </div>
  );
}
