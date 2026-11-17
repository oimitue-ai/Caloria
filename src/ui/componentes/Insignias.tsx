import { BadgeCheck, ChefHat, Factory, User, Users } from 'lucide-react';
import type { EstadoValidacion, FuenteId } from '../../tipos';
import { NOMBRE_FUENTE, VALIDACION, cx } from '../util';

const ICONO = { oficial: BadgeCheck, etiqueta: Factory, comunidad: Users, propio: User } as const;

/** Insignia de fuente/validación: dice de dónde sale el dato y qué tan confiable es. */
export function InsigniaFuente({ fuente, validacion, conFuente = false, className }: {
  fuente: FuenteId; validacion: EstadoValidacion; conFuente?: boolean; className?: string;
}) {
  const v = VALIDACION[validacion];
  const Icono = fuente === 'receta' || validacion === 'receta_estandar' ? ChefHat : ICONO[v.tono];
  const texto = fuente === 'receta' ? 'Mi receta' : fuente === 'usuario' ? 'Mi alimento' : v.texto;
  return (
    <span
      title={`${NOMBRE_FUENTE[fuente]}: ${v.descripcion}`}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.72rem] font-semibold leading-5',
        v.tono === 'oficial' && 'bg-exito-tinte text-exito',
        v.tono === 'etiqueta' && 'bg-talavera-tinte text-talavera',
        v.tono === 'comunidad' && 'bg-cempasuchil-tinte text-cempasuchil-texto',
        v.tono === 'propio' && 'bg-hundido text-tinta-2',
        className,
      )}
    >
      <Icono aria-hidden size={13} strokeWidth={2.4} />
      {texto}
      {conFuente && fuente !== 'usuario' && fuente !== 'receta' && <span className="font-normal opacity-80">({NOMBRE_FUENTE[fuente]})</span>}
    </span>
  );
}
