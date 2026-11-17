import { useRef, useState } from 'react';
import { FileJson, FileSpreadsheet, FileText, HardDrive, ShieldCheck, Upload } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fechaLocal, formatear, formatearFechaLarga } from '../../nucleo';
import { Boton, Encabezado, Nota, Segmentado, Selector, Tarjeta, Volver } from '../componentes/base';
import { useAvisos } from '../componentes/Avisos';
import * as datos from '../servicios/datos';
import * as respaldo from '../servicios/respaldo';
import type { ModoImportacion, Respaldo as TipoRespaldo } from '../servicios/respaldo';

const NOMBRES_TABLAS: Partial<Record<string, string>> = {
  registros: 'alimentos registrados', pesos: 'registros de peso', recetas: 'recetas', alimentosUsuario: 'alimentos propios',
  metas: 'metas', favoritos: 'favoritos',
};

function BotonExportar({ icono: Icono, titulo, texto, accion }: { icono: LucideIcon; titulo: string; texto: string; accion: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <button type="button" disabled={ocupado} onClick={async () => { setOcupado(true); try { await accion(); } finally { setOcupado(false); } }}
      className="flex min-h-16 w-full items-center gap-3 rounded-control border border-borde px-4 py-3 text-left transition hover:border-talavera hover:bg-talavera-tinte/40 disabled:opacity-60">
      <Icono aria-hidden size={24} className="shrink-0 text-talavera" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{ocupado ? 'Preparando…' : titulo}</span>
        <span className="block text-sm text-tinta-3">{texto}</span>
      </span>
    </button>
  );
}

export default function Respaldo() {
  const { avisar, confirmar } = useAvisos();
  const config = datos.useConfig();
  const { estado, actualizar } = datos.useEstadoAlmacenamiento();
  const archivo = useRef<HTMLInputElement>(null);
  const [leido, setLeido] = useState<{ respaldo: TipoRespaldo; conteos: Record<string, number>; nombre: string } | null>(null);
  const [modo, setModo] = useState<ModoImportacion>('combinar');
  const [errorArchivo, setErrorArchivo] = useState('');

  const entregar = async (blob: Blob, nombre: string) => {
    const r = await respaldo.compartirODescargar(blob, nombre);
    avisar({ texto: r === 'compartido' ? 'Archivo listo para compartir' : `Descargado: ${nombre}`, tono: 'exito' });
  };
  const conError = (f: () => Promise<void>) => async () => {
    try { await f(); } catch (e) { avisar({ texto: e instanceof Error ? e.message : 'No se pudo exportar.', tono: 'error' }); }
  };

  const leerArchivo = async (f: File | undefined) => {
    setErrorArchivo('');
    setLeido(null);
    if (!f) return;
    const r = await respaldo.leerRespaldo(f);
    if (!r.ok) { setErrorArchivo(r.error); return; }
    setLeido({ respaldo: r.respaldo, conteos: r.conteos, nombre: f.name });
  };

  const importar = async () => {
    if (!leido) return;
    const ok = await confirmar({
      titulo: modo === 'reemplazar' ? '¿Reemplazar todos tus datos?' : '¿Combinar con tus datos?',
      texto: modo === 'reemplazar'
        ? 'Se borrará todo lo que hay en este dispositivo y quedará exactamente lo del respaldo. No se puede deshacer; considera exportar un respaldo antes.'
        : 'Se agregará lo que no tengas. Lo que ya existe en este dispositivo se conserva.',
      confirmar: modo === 'reemplazar' ? 'Reemplazar' : 'Combinar',
      peligro: modo === 'reemplazar',
    });
    if (!ok) return;
    try {
      const r = await respaldo.importarRespaldo(leido.respaldo, modo);
      const n = Object.values(r.agregados).reduce((a, b) => a + b, 0);
      avisar({ texto: `Respaldo importado: ${formatear(n, 0)} elementos ${modo === 'reemplazar' ? 'restaurados' : 'agregados'}`, tono: 'exito' });
      setLeido(null);
      if (archivo.current) archivo.current.value = '';
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : 'No se pudo importar.', tono: 'error' });
    }
  };

  const ultimo = config?.ultimoRespaldo ? fechaLocal(new Date(config.ultimoRespaldo)) : null;

  return (
    <div>
      <Encabezado titulo="Respaldo y exportación" volver={<Volver a="/mas" />} />
      <div className="grid gap-4 px-3 lg:grid-cols-2 lg:items-start lg:px-0">
        <div className="space-y-4">
          <Tarjeta className="space-y-3 p-4 sm:p-5" aria-labelledby="titulo-donde">
            <h2 id="titulo-donde" className="flex items-center gap-2 text-lg font-semibold"><HardDrive aria-hidden size={20} className="text-talavera" />Tus datos viven en este dispositivo</h2>
            <p className="text-tinta-2">CALORÍA no tiene servidor ni cuentas: tus comidas, peso y recetas se guardan solo en este navegador. Si borras los datos del sitio, desinstalas la app o pierdes el teléfono, se pierden. Exporta un respaldo de vez en cuando y guárdalo en tu nube o correo.</p>
            {estado && (
              <dl className="grid grid-cols-2 gap-3 rounded-control bg-hundido p-3 text-sm">
                <div>
                  <dt className="text-tinta-2">Almacenamiento persistente</dt>
                  <dd className="font-semibold">{estado.persistente === true ? 'Activado' : estado.persistente === false ? 'No activado' : 'No disponible'}</dd>
                </div>
                <div>
                  <dt className="text-tinta-2">Espacio usado</dt>
                  <dd className="font-semibold cifras">{datos.formatearBytes(estado.usoBytes)}{estado.cuotaBytes ? ` de ${datos.formatearBytes(estado.cuotaBytes)}` : ''}</dd>
                </div>
              </dl>
            )}
            {estado?.persistente === false && (
              <>
                <p className="text-sm text-tinta-3">Sin almacenamiento persistente, el navegador podría borrar los datos si el dispositivo se queda sin espacio. Instalar la app suele activarlo.</p>
                <Boton chico variante="secundario" icono={ShieldCheck} onClick={async () => {
                  const r = await datos.solicitarPersistencia();
                  actualizar();
                  avisar({ texto: r ? 'Almacenamiento persistente activado' : 'El navegador no lo concedió por ahora', tono: r ? 'exito' : 'neutro' });
                }}>Pedir almacenamiento persistente</Boton>
              </>
            )}
          </Tarjeta>

          <Tarjeta className="space-y-3 p-4 sm:p-5" aria-labelledby="titulo-recordatorio">
            <h2 id="titulo-recordatorio" className="text-lg font-semibold">Recordatorio</h2>
            <p className="text-tinta-2">{ultimo ? `Último respaldo: ${formatearFechaLarga(ultimo)}.` : 'Aún no has hecho ningún respaldo.'}</p>
            <Selector etiqueta="Recordarme respaldar" value={String(config?.recordarRespaldoDias ?? 7)}
              onChange={(e) => void datos.guardarConfig({ recordarRespaldoDias: Number(e.target.value) })}>
              <option value="3">Cada 3 días</option>
              <option value="7">Cada semana</option>
              <option value="14">Cada 2 semanas</option>
              <option value="30">Cada mes</option>
              <option value="0">Nunca</option>
            </Selector>
          </Tarjeta>
        </div>

        <div className="space-y-4">
          <Tarjeta className="space-y-3 p-4 sm:p-5" aria-labelledby="titulo-exportar">
            <h2 id="titulo-exportar" className="text-lg font-semibold">Exportar</h2>
            <BotonExportar icono={FileJson} titulo="Respaldo completo (JSON)" texto="Todo, para restaurarlo aquí o en otro dispositivo"
              accion={conError(async () => { const r = await respaldo.exportarRespaldoJSON(); await entregar(r.blob, r.nombreArchivo); })} />
            <BotonExportar icono={FileSpreadsheet} titulo="Excel (.xlsx)" texto="Comidas, resumen diario, peso, recetas y alimentos"
              accion={conError(async () => { const r = await respaldo.exportarExcel(); await entregar(r.blob, r.nombreArchivo); })} />
            <BotonExportar icono={FileText} titulo="Comidas (CSV)" texto="Cada alimento registrado, para hojas de cálculo"
              accion={conError(async () => { const r = await respaldo.exportarComidasCSV(); await entregar(r.blob, r.nombreArchivo); })} />
            <BotonExportar icono={FileText} titulo="Peso (CSV)" texto="Tu historial de peso"
              accion={conError(async () => { const r = await respaldo.exportarPesoCSV(); await entregar(r.blob, r.nombreArchivo); })} />
            <p className="text-sm text-tinta-3">Solo el respaldo JSON se puede volver a importar.</p>
          </Tarjeta>

          <Tarjeta className="space-y-3 p-4 sm:p-5" aria-labelledby="titulo-importar">
            <h2 id="titulo-importar" className="text-lg font-semibold">Importar un respaldo</h2>
            <input ref={archivo} type="file" accept=".json,.gz,application/json,application/gzip" className="sr-only" id="archivo-respaldo"
              onChange={(e) => void leerArchivo(e.target.files?.[0])} />
            <label htmlFor="archivo-respaldo" className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-control bg-talavera-tinte px-5 font-semibold text-talavera hover:brightness-95">
              <Upload aria-hidden size={20} /> Elegir archivo
            </label>
            {errorArchivo && <p role="alert" className="text-sm text-exceso">{errorArchivo}</p>}
            {leido && (
              <div className="space-y-3">
                <Nota icono={FileJson}>
                  <p className="font-semibold">{leido.nombre}</p>
                  <p>Creado el {formatearFechaLarga(fechaLocal(new Date(leido.respaldo.creado)))}. Contiene:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {Object.entries(leido.conteos).filter(([k, v]) => v > 0 && NOMBRES_TABLAS[k]).map(([k, v]) => (
                      <li key={k} className="cifras">{formatear(v, 0)} {NOMBRES_TABLAS[k]}</li>
                    ))}
                  </ul>
                </Nota>
                <Segmentado<ModoImportacion> etiqueta="Modo de importación" valor={modo} onCambio={setModo}
                  opciones={[{ valor: 'combinar', texto: 'Combinar' }, { valor: 'reemplazar', texto: 'Reemplazar todo' }]} />
                <p className="text-sm text-tinta-3">
                  {modo === 'combinar' ? 'Agrega lo que falte y conserva lo que ya tienes.' : 'Borra los datos actuales y deja solo los del respaldo.'}
                </p>
                <Boton ancho variante={modo === 'reemplazar' ? 'peligro' : 'primario'} onClick={importar}>
                  {modo === 'reemplazar' ? 'Reemplazar con este respaldo' : 'Combinar este respaldo'}
                </Boton>
              </div>
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
