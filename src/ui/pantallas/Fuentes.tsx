import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatear, formatearFechaLarga, fechaLocal } from '../../nucleo';
import type { ManifiestoCatalogo } from '../../tipos';
import { Cargando, Encabezado, Nota, Tarjeta, Volver } from '../componentes/base';
import { leerManifiesto } from '../servicios/catalogo';
import { NOMBRE_FUENTE } from '../util';

function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : formatearFechaLarga(fechaLocal(d));
}

export default function Fuentes() {
  const [m, setM] = useState<ManifiestoCatalogo | null | undefined>(undefined);
  useEffect(() => { void leerManifiesto().then(setM); }, []);

  return (
    <div>
      <Encabezado titulo="Fuentes y licencias" subtitulo="De dónde salen los valores nutrimentales del catálogo." volver={<Volver a="/mas" />} />
      <div className="space-y-4 px-3 lg:px-0">
        {m === undefined ? <Cargando /> : m === null ? (
          <Nota>No se pudo leer la lista de fuentes del catálogo. Conéctate a internet y vuelve a abrir esta pantalla.</Nota>
        ) : (
          <>
            <Tarjeta className="p-4 sm:p-5">
              <p className="font-display text-[2rem] font-bold leading-tight cifras">{formatear(m.totalRegistros, 0)}</p>
              <p className="text-tinta-2">alimentos en el catálogo, versión {m.version}, generado el {fecha(m.generado)}.</p>
            </Tarjeta>
            <ul className="space-y-3">
              {m.fuentes.map((f) => (
                <li key={f.id}>
                  <Tarjeta as="article" className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-lg font-semibold">{f.nombre}</h2>
                      <span className="text-sm font-semibold text-tinta-2 cifras">{formatear(f.registros, 0)} registros</span>
                    </div>
                    <p className="text-sm text-tinta-3">{NOMBRE_FUENTE[f.id] ?? f.id}, versión {f.version}, importada el {fecha(f.fechaImportacion)}</p>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div><dt className="font-semibold">Licencia</dt><dd className="text-tinta-2">{f.licencia}</dd></div>
                      <div><dt className="font-semibold">Atribución</dt><dd className="text-tinta-2">{f.atribucion}</dd></div>
                    </dl>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-talavera underline-offset-2 hover:underline">
                        Ver la fuente <ExternalLink aria-hidden size={16} />
                      </a>
                    )}
                    {f.id === 'off' && (
                      <Nota className="mt-3">
                        Los productos de Open Food Facts se distribuyen bajo la Open Database License (ODbL) y se mantienen como un conjunto separado.
                        Los datos los aportan voluntarios y pueden contener errores: se marcan con la insignia “Comunidad”.
                      </Nota>
                    )}
                  </Tarjeta>
                </li>
              ))}
            </ul>
          </>
        )}
        <Tarjeta className="space-y-2 p-4 text-sm sm:p-5">
          <h2 className="text-lg font-semibold">Qué significan las insignias</h2>
          <p><strong>Oficial:</strong> tablas de composición oficiales o análisis de laboratorio.</p>
          <p><strong>Etiqueta:</strong> lo que declara el fabricante en el empaque.</p>
          <p><strong>Comunidad:</strong> aportado por usuarios de Open Food Facts; revisa la etiqueta si algo no cuadra.</p>
          <p><strong>Receta estándar:</strong> platillo calculado a partir de ingredientes oficiales; la preparación real varía.</p>
          <p><strong>Tuyo:</strong> alimentos y recetas que creaste tú.</p>
        </Tarjeta>
      </div>
    </div>
  );
}
