import { Link } from 'react-router-dom';
import { ChefHat, Plus } from 'lucide-react';
import { formatear, totalesPorPorcion } from '../../nucleo';
import { Cargando, Encabezado, Tarjeta, Vacio, Volver } from '../componentes/base';
import { MacrosEnLinea } from '../componentes/Medidores';
import { useRecetas } from '../servicios/datos';

export default function Recetas() {
  const recetas = useRecetas();
  const nueva = (
    <Link to="/mas/recetas/nueva" className="inline-flex min-h-11 items-center gap-2 rounded-control bg-talavera px-4 font-semibold text-sobre-talavera hover:bg-talavera-fuerte">
      <Plus aria-hidden size={20} /> Nueva
    </Link>
  );
  return (
    <div>
      <Encabezado titulo="Recetas" subtitulo="Arma un platillo una vez y registra porciones cuando quieras." volver={<Volver a="/mas" />} acciones={nueva} />
      <div className="px-3 lg:px-0">
        {!recetas ? <Cargando /> : recetas.length === 0 ? (
          <Tarjeta><Vacio icono={ChefHat} titulo="Crea tu primera receta" texto="Por ejemplo, el pozole de la casa: agrega sus ingredientes, cuántas porciones rinde y listo." accion={nueva} /></Tarjeta>
        ) : (
          <Tarjeta as="div" className="overflow-hidden">
            <ul className="divide-y divide-borde">
              {recetas.map((r) => {
                let porPorcion = null;
                try { porPorcion = totalesPorPorcion(r); } catch { /* receta incompleta */ }
                return (
                  <li key={r.id}>
                    <Link to={`/mas/recetas/${r.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-hundido/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{r.nombre}</span>
                        <span className="block text-sm text-tinta-3">{r.ingredientes.length} {r.ingredientes.length === 1 ? 'ingrediente' : 'ingredientes'}, rinde {formatear(r.porciones, 1)} {r.porciones === 1 ? 'porción' : 'porciones'}</span>
                      </span>
                      {porPorcion && (
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold cifras">{formatear(porPorcion.kcal, 0)} kcal</span>
                          <MacrosEnLinea p={porPorcion.proteina} c={porPorcion.carbohidratos} g={porPorcion.grasa} />
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        )}
        {recetas && recetas.length > 0 && <p className="mt-2 px-1 text-sm text-tinta-3">Calorías y macros por porción.</p>}
      </div>
    </div>
  );
}
