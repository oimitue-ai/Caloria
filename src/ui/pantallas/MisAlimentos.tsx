import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Apple, Plus, Search } from 'lucide-react';
import { formatear } from '../../nucleo';
import { Cargando, Encabezado, Tarjeta, Vacio, Volver } from '../componentes/base';
import { MacrosEnLinea } from '../componentes/Medidores';
import { normalizarTexto, useAlimentosUsuario } from '../servicios/datos';

export default function MisAlimentos() {
  const alimentos = useAlimentosUsuario();
  const [filtro, setFiltro] = useState('');
  const lista = useMemo(() => {
    const f = normalizarTexto(filtro);
    return (alimentos ?? []).filter((a) => !f || normalizarTexto(`${a.nombre} ${a.marca ?? ''}`).includes(f));
  }, [alimentos, filtro]);

  const nuevo = (
    <Link to="/mas/alimentos/nuevo" className="inline-flex min-h-11 items-center gap-2 rounded-control bg-talavera px-4 font-semibold text-sobre-talavera hover:bg-talavera-fuerte">
      <Plus aria-hidden size={20} /> Nuevo
    </Link>
  );

  return (
    <div>
      <Encabezado titulo="Mis alimentos" subtitulo="Alimentos que capturas tú, por ejemplo de una etiqueta." volver={<Volver a="/mas" />} acciones={nuevo} />
      <div className="space-y-3 px-3 lg:px-0">
        {!alimentos ? <Cargando /> : alimentos.length === 0 ? (
          <Tarjeta><Vacio icono={Apple} titulo="Aún no tienes alimentos propios" texto="Crea uno cuando no encuentres algo en el catálogo; podrás registrarlo como cualquier otro." accion={nuevo} /></Tarjeta>
        ) : (
          <>
            <label className="flex items-center gap-2 rounded-control border border-borde bg-superficie pl-3 focus-within:border-talavera focus-within:ring-2 focus-within:ring-talavera/30">
              <Search aria-hidden size={18} className="text-tinta-3" />
              <span className="sr-only">Filtrar mis alimentos</span>
              <input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar"
                className="min-h-12 w-full bg-transparent pr-3 focus:outline-none" />
            </label>
            <Tarjeta as="div" className="overflow-hidden">
              <ul className="divide-y divide-borde">
                {lista.map((a) => (
                  <li key={a.id}>
                    <Link to={`/mas/alimentos/${encodeURIComponent(a.id)}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-hundido/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{a.nombre}</span>
                        <span className="block truncate text-sm text-tinta-3">{a.marca ?? `Por 100 ${a.base}`}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold cifras">{formatear(a.nutrientes.kcal, 0)} kcal</span>
                        <MacrosEnLinea p={a.nutrientes.proteina} c={a.nutrientes.carbohidratos} g={a.nutrientes.grasa} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Tarjeta>
            <p className="px-1 text-sm text-tinta-3">Valores por 100 g o 100 ml.</p>
          </>
        )}
      </div>
    </div>
  );
}
