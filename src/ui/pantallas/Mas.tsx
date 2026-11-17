import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Apple, BookOpenText, ChefHat, ChevronRight, DatabaseBackup, Download, Info, Moon, Share, SquarePlus, Target,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Boton, Encabezado, Nota, Segmentado, Tarjeta } from '../componentes/base';
import { Hoja } from '../componentes/Hoja';
import { usePwa } from '../pwa/ContextoPwa';
import { respaldoPendiente, useConfig } from '../servicios/datos';
import { useTema } from '../tema';
import type { Tema } from '../tema';

function Enlace({ a, icono: Icono, titulo, texto }: { a: string; icono: LucideIcon; titulo: string; texto: string }) {
  return (
    <li>
      <Link to={a} className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-hundido/60">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-talavera-tinte text-talavera"><Icono aria-hidden size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{titulo}</span>
          <span className="block text-sm text-tinta-3">{texto}</span>
        </span>
        <ChevronRight aria-hidden size={20} className="text-tinta-3" />
      </Link>
    </li>
  );
}

export default function Mas() {
  const { tema, cambiarTema } = useTema();
  const config = useConfig();
  const { puedeInstalar, instalar, instalada, esIOS } = usePwa();
  const [ayudaIOS, setAyudaIOS] = useState(false);

  return (
    <div>
      <Encabezado titulo="Más" />
      <div className="space-y-5 px-3 lg:px-0">
        {config && respaldoPendiente(config) && (
          <Nota tono="aviso" icono={DatabaseBackup}>
            {config.ultimoRespaldo ? 'Hace tiempo que no respaldas tus datos.' : 'Aún no has respaldado tus datos.'}{' '}
            Viven solo en este dispositivo. <Link to="/mas/respaldo" className="font-semibold text-talavera underline underline-offset-2">Crear respaldo</Link>
          </Nota>
        )}

        <section aria-labelledby="sec-datos">
          <h2 id="sec-datos" className="mb-2 px-1 text-base font-semibold text-tinta-2">Tus datos</h2>
          <Tarjeta as="div" className="overflow-hidden">
            <ul className="divide-y divide-borde">
              <Enlace a="/mas/perfil" icono={Target} titulo="Perfil y metas" texto="Tus datos, calorías y macros diarios" />
              <Enlace a="/mas/recetas" icono={ChefHat} titulo="Recetas" texto="Platillos con tus ingredientes y porciones" />
              <Enlace a="/mas/alimentos" icono={Apple} titulo="Mis alimentos" texto="Alimentos que no están en el catálogo" />
              <Enlace a="/mas/respaldo" icono={DatabaseBackup} titulo="Respaldo y exportación" texto="JSON, CSV y Excel; restaurar un respaldo" />
            </ul>
          </Tarjeta>
        </section>

        <section aria-labelledby="sec-apariencia">
          <h2 id="sec-apariencia" className="mb-2 px-1 text-base font-semibold text-tinta-2">Apariencia</h2>
          <Tarjeta as="div" className="p-4">
            <div className="mb-3 flex items-center gap-3">
              <Moon aria-hidden size={20} className="text-tinta-2" />
              <span className="font-semibold">Tema</span>
            </div>
            <Segmentado<Tema> etiqueta="Tema" valor={tema} onCambio={cambiarTema}
              opciones={[{ valor: 'claro', texto: 'Claro' }, { valor: 'oscuro', texto: 'Oscuro' }, { valor: 'sistema', texto: 'Del sistema' }]} />
          </Tarjeta>
        </section>

        {!instalada && (
          <section aria-labelledby="sec-instalar">
            <h2 id="sec-instalar" className="mb-2 px-1 text-base font-semibold text-tinta-2">Instalar</h2>
            <Tarjeta as="div" className="p-4">
              <p className="text-tinta-2">Instala CALORÍA para abrirla desde tu pantalla de inicio, a pantalla completa y sin conexión.</p>
              <div className="mt-3">
                {puedeInstalar ? (
                  <Boton icono={Download} onClick={() => void instalar()}>Instalar app</Boton>
                ) : esIOS ? (
                  <Boton variante="secundario" icono={Share} onClick={() => setAyudaIOS(true)}>Cómo instalar en iPhone</Boton>
                ) : (
                  <p className="text-sm text-tinta-3">En Chrome para Android: abre el menú ⋮ y elige “Instalar app” o “Agregar a la pantalla principal”. En computadora, usa el ícono de instalar en la barra de direcciones.</p>
                )}
              </div>
            </Tarjeta>
          </section>
        )}

        <section aria-labelledby="sec-info">
          <h2 id="sec-info" className="mb-2 px-1 text-base font-semibold text-tinta-2">Información</h2>
          <Tarjeta as="div" className="overflow-hidden">
            <ul className="divide-y divide-borde">
              <Enlace a="/mas/fuentes" icono={BookOpenText} titulo="Fuentes y licencias de datos" texto="De dónde salen los valores nutrimentales" />
              <Enlace a="/mas/acerca" icono={Info} titulo="Acerca de CALORÍA" texto="Privacidad, versión y aviso de salud" />
            </ul>
          </Tarjeta>
        </section>
      </div>

      <Hoja abierta={ayudaIOS} onCerrar={() => setAyudaIOS(false)} titulo="Instalar en iPhone o iPad">
        <ol className="list-decimal space-y-3 px-4 pb-6 pl-9 text-tinta-2 marker:font-semibold marker:text-tinta">
          <li>Abre CALORÍA en <strong className="text-tinta">Safari</strong>.</li>
          <li>Toca el botón <strong className="text-tinta">Compartir</strong> <Share aria-label="(ícono de compartir)" className="inline" size={18} /> en la barra inferior.</li>
          <li>Desliza y elige <strong className="text-tinta">Agregar a inicio</strong> <SquarePlus aria-label="(ícono de agregar)" className="inline" size={18} />.</li>
          <li>Toca <strong className="text-tinta">Agregar</strong>. CALORÍA aparecerá como app en tu pantalla de inicio.</li>
        </ol>
      </Hoja>
    </div>
  );
}
