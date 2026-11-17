import { Link } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { formatear } from '../../nucleo';
import type { Alimento, ResultadoBusqueda } from '../../tipos';
import { Boton, Nota } from '../componentes/base';
import { InsigniaFuente } from '../componentes/Insignias';
import type { EstadoBusqueda } from './useBusqueda';

export function ResultadosBusqueda({ estado, locales, resultados, parcial, hayMas, cargandoMas, onMas, onElegir, texto, onCerrar }: {
  estado: EstadoBusqueda;
  locales: Alimento[];
  resultados: ResultadoBusqueda[];
  parcial: boolean;
  hayMas: boolean;
  cargandoMas: boolean;
  onMas: () => void;
  onElegir: (id: string, a?: Alimento) => void;
  texto: string;
  onCerrar: () => void;
}) {
  const nada = estado !== 'buscando' && !locales.length && !resultados.length;
  return (
    <div className="pb-6" aria-busy={estado === 'buscando'}>
      {parcial && (
        <div className="px-4 pb-2">
          <Nota tono="aviso" icono={WifiOff}>
            {estado === 'error'
              ? 'El catálogo no está disponible ahora. Te mostramos tus alimentos y los que ya usaste en este dispositivo.'
              : 'Sin conexión: faltan productos de marca. Los alimentos genéricos y mexicanos sí aparecen.'}
          </Nota>
        </div>
      )}
      {locales.length > 0 && (
        <ul className="divide-y divide-borde/70" aria-label="Tus alimentos y recetas">
          {locales.map((a) => (
            <FilaResultado
              key={a.id}
              nombre={a.nombre}
              marca={a.marca}
              fuente={a.fuente}
              validacion={a.validacion}
              base={a.base}
              kcal100={a.nutrientes.kcal}
              porcion={a.porciones.find((p) => p.predeterminada) ?? a.porciones[0]}
              onClick={() => onElegir(a.id, a)}
            />
          ))}
        </ul>
      )}
      {resultados.length > 0 && (
        <ul className="divide-y divide-borde/70 border-t border-borde/70" aria-label="Resultados del catálogo">
          {resultados.map((r) => (
            <FilaResultado
              key={r.id}
              nombre={r.nombre}
              marca={r.marca}
              fuente={r.fuente}
              validacion={r.validacion}
              base={r.base}
              kcal100={r.kcal}
              porcion={r.porcionSugerida}
              mexicano={r.mexicano}
              onClick={() => onElegir(r.id)}
            />
          ))}
        </ul>
      )}
      {hayMas && (
        <div className="px-4 pt-3">
          <Boton variante="fantasma" ancho onClick={onMas} disabled={cargandoMas}>{cargandoMas ? 'Cargando…' : 'Mostrar más resultados'}</Boton>
        </div>
      )}
      {nada && (
        <div className="px-8 py-10 text-center text-tinta-2">
          <p>No encontramos “{texto}”.</p>
          <p className="mt-1 text-sm text-tinta-3">Prueba con otra palabra, revisa la ortografía o crea tu propio alimento.</p>
          <Link to={`/mas/alimentos/nuevo?nombre=${encodeURIComponent(texto)}`} onClick={onCerrar}
            className="mt-3 inline-flex min-h-11 items-center gap-1 font-semibold text-talavera underline underline-offset-2">
            Crear “{texto}”
          </Link>
        </div>
      )}
    </div>
  );
}

function FilaResultado({ nombre, marca, fuente, validacion, base, kcal100, porcion, mexicano, onClick }: {
  nombre: string; marca?: string; fuente: Alimento['fuente']; validacion: Alimento['validacion']; base: 'g' | 'ml';
  kcal100?: number; porcion?: { etiqueta: string; equivalencia: number }; mexicano?: boolean; onClick: () => void;
}) {
  const kcalPorcion = porcion && kcal100 !== undefined ? (kcal100 * porcion.equivalencia) / 100 : undefined;
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hundido/60">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-semibold leading-snug">{nombre}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta-3">
            {marca && <span className="max-w-[12rem] truncate text-tinta-2">{marca}</span>}
            <InsigniaFuente fuente={fuente} validacion={validacion} />
            {mexicano && <span className="text-xs font-semibold text-cempasuchil-texto">Mexicano</span>}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {kcalPorcion !== undefined ? (
            <>
              <span className="block font-semibold cifras">{formatear(kcalPorcion, 0)} kcal</span>
              <span className="block max-w-[8.5rem] truncate text-xs text-tinta-3" title={porcion!.etiqueta}>{porcion!.etiqueta}</span>
              <span className="block text-xs text-tinta-3 cifras">{formatear(kcal100, 0)} / 100 {base}</span>
            </>
          ) : (
            <>
              <span className="block font-semibold cifras">{formatear(kcal100, 0)} kcal</span>
              <span className="block text-xs text-tinta-3">por 100 {base}</span>
            </>
          )}
        </span>
      </button>
    </li>
  );
}

