/** Alimentos de prueba con valores conocidos (aprox. USDA). Solo para pruebas. */
import type { Alimento } from '../../tipos';

const base = {
  idiomaOriginal: 'es',
  validacion: 'oficial' as const,
};

export const platano: Alimento = {
  ...base,
  id: 'usda_sr_legacy:09040',
  fuente: 'usda_sr_legacy',
  idOriginal: '09040',
  nombre: 'Plátano crudo',
  nombreOriginal: 'Bananas, raw',
  base: 'g',
  nutrientes: { kcal: 89, proteina: 1.09, carbohidratos: 22.84, grasa: 0.33, fibra: 2.6, azucares: 12.23, sodio: 1 },
  porciones: [
    { etiqueta: '1 pieza mediana (118 g)', unidad: 'pieza', equivalencia: 118, predeterminada: true },
    { etiqueta: '1 pieza grande (136 g)', unidad: 'pieza', equivalencia: 136 },
    { etiqueta: '1 taza en rodajas (150 g)', unidad: 'taza', equivalencia: 150 },
  ],
};

/** Leche entera con base ml. Sin densidad. */
export const lecheSinDensidad: Alimento = {
  ...base,
  id: 'prueba:leche',
  fuente: 'usda_fndds',
  idOriginal: 'leche',
  nombre: 'Leche entera',
  nombreOriginal: 'Milk, whole',
  base: 'ml',
  nutrientes: { kcal: 63, proteina: 3.2, carbohidratos: 4.9, grasa: 3.4, sodio: 44 },
  porciones: [],
};

export const leche: Alimento = { ...lecheSinDensidad, densidad: 1.03 };

export const avena: Alimento = {
  ...base,
  id: 'usda_sr_legacy:08120',
  fuente: 'usda_sr_legacy',
  idOriginal: '08120',
  nombre: 'Avena en hojuelas',
  nombreOriginal: 'Oats',
  base: 'g',
  nutrientes: { kcal: 389, proteina: 16.89, carbohidratos: 66.27, grasa: 6.9, fibra: 10.6 },
  porciones: [{ etiqueta: '1/2 taza (40 g)', unidad: 'taza', equivalencia: 80 }],
};

/** Alimento con un macro faltante (grasa undefined) para probar `faltantes`. */
export const incompleto: Alimento = {
  ...base,
  id: 'off:123',
  fuente: 'off',
  idOriginal: '123',
  nombre: 'Galleta X',
  nombreOriginal: 'Galleta X',
  base: 'g',
  nutrientes: { kcal: 450, proteina: 6, carbohidratos: 70 },
  porciones: [],
  validacion: 'comunidad',
};
