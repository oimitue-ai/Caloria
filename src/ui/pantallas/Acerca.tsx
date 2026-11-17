import { HeartPulse, Lock, Trash2 } from 'lucide-react';
import { AVISO_CONSULTA, AVISO_ORIENTATIVO } from '../../nucleo';
import { Boton, Encabezado, Tarjeta, Volver } from '../componentes/base';
import { Logo } from '../componentes/Marco';
import { useAvisos } from '../componentes/Avisos';
import { borrarBaseDeDatos } from '../servicios/datos';

const VERSION = '1.0.0';

export default function Acerca() {
  const { confirmar } = useAvisos();
  const borrarTodo = async () => {
    const ok = await confirmar({
      titulo: '¿Borrar todos tus datos?',
      texto: 'Se eliminarán de este dispositivo tus comidas, peso, recetas, alimentos, perfil y metas. No se puede deshacer. Exporta un respaldo antes si quieres conservarlos.',
      confirmar: 'Borrar todo', peligro: true,
    });
    if (!ok) return;
    await borrarBaseDeDatos();
    try { localStorage.removeItem('caloria.asistente'); } catch { /* modo privado */ }
    window.location.hash = '#/';
    window.location.reload();
  };
  return (
    <div>
      <Encabezado titulo="Acerca de" volver={<Volver a="/mas" />} />
      <div className="space-y-4 px-3 lg:px-0">
        <Tarjeta className="flex items-center gap-4 p-4 sm:p-5">
          <Logo tam={56} />
          <div>
            <p className="font-display text-2xl font-extrabold">CALORÍA</p>
            <p className="text-tinta-2">Versión {VERSION}. Registro de comidas, calorías, macros y peso.</p>
          </div>
        </Tarjeta>
        <Tarjeta className="space-y-2 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Lock aria-hidden size={20} className="text-talavera" />Privacidad</h2>
          <p className="text-tinta-2">No hay cuentas, anuncios ni rastreo. Todo lo que registras se queda en este dispositivo. La app solo descarga del sitio los archivos del catálogo de alimentos; tus búsquedas se resuelven en tu equipo.</p>
        </Tarjeta>
        <Tarjeta className="space-y-2 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><HeartPulse aria-hidden size={20} className="text-talavera" />Aviso de salud</h2>
          <p className="text-tinta-2">{AVISO_ORIENTATIVO}</p>
          <p className="text-tinta-2">{AVISO_CONSULTA}</p>
        </Tarjeta>
        <Tarjeta className="space-y-2 p-4 text-sm sm:p-5">
          <h2 className="text-lg font-semibold">Créditos</h2>
          <p className="text-tinta-2">Datos nutrimentales: ver “Fuentes y licencias de datos”.</p>
          <p className="text-tinta-2">Tipografías Bricolage Grotesque y Atkinson Hyperlegible Next (SIL Open Font License). Íconos Lucide (licencia ISC).</p>
        </Tarjeta>
        <Tarjeta className="space-y-3 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Borrar datos</h2>
          <p className="text-tinta-2">Elimina toda la información de CALORÍA en este dispositivo.</p>
          <Boton variante="peligro" icono={Trash2} onClick={borrarTodo}>Borrar todos mis datos</Boton>
        </Tarjeta>
      </div>
    </div>
  );
}
