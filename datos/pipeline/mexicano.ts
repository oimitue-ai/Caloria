import { normalizar } from '../../src/catalogo/normalizar.ts';

/** Palabras clave (normalizadas) de platillos e ingredientes mexicanos en descripciones USDA (inglés o español). */
const CLAVES = [
  'taco', 'tacos', 'burrito', 'burritos', 'enchilada', 'enchiladas', 'tamale', 'tamales', 'tamal', 'quesadilla',
  'quesadillas', 'tostada', 'tostadas', 'tortilla', 'tortillas', 'nopal', 'nopales', 'tomatillo', 'tomatillos',
  'jicama', 'chayote', 'mole', 'pozole', 'posole', 'menudo', 'chilaquiles', 'gordita', 'gorditas', 'sope', 'sopes',
  'huarache', 'flauta', 'flautas', 'taquito', 'taquitos', 'chimichanga', 'fajita', 'fajitas', 'nachos', 'horchata',
  'atole', 'champurrado', 'carnitas', 'barbacoa', 'birria', 'chorizo', 'chicharron', 'chicharrones', 'frijoles',
  'refried', 'pico de gallo', 'salsa', 'guacamole', 'queso fresco', 'queso anejo', 'cotija', 'queso chihuahua',
  'queso asadero', 'mexican', 'mexicana', 'mexicano', 'bolillo', 'pan dulce', 'concha', 'churro', 'churros',
  'tres leches', 'elote', 'hominy', 'masa', 'epazote', 'chipotle', 'jalapeno', 'poblano', 'serrano', 'ancho pepper',
  'pasilla', 'tamarind', 'guava', 'mamey', 'sapote', 'prickly pear', 'cactus', 'huitlacoche', 'cajeta',
  'agua fresca', 'chile relleno', 'chiles rellenos', 'huevos rancheros', 'ceviche', 'nixtamal', 'pinto',
  'chili con carne', 'tex mex', 'latino',
].map(normalizar);

export function esMexicanoPorTexto(texto: string): boolean {
  const t = ` ${normalizar(texto)} `;
  return CLAVES.some((c) => t.includes(` ${c} `));
}

/** Marcas mexicanas frecuentes (normalizadas). */
const MARCAS_MX = new Set(
  [
    'lala', 'alpura', 'bimbo', 'marinela', 'barcel', 'sabritas', 'gamesa', 'herdez', 'la costena', 'jumex', 'maseca',
    'del valle', 'la moderna', 'tia rosa', 'tia rosa', 'santa clara', 'nutrileche', 'zwan', 'fud', 'san rafael',
    'chata', 'la morena', 'clemente jacques', 'mccormick mexico', 'yoplait mexico', 'danone mexico', 'boing',
    'jarritos', 'penafiel', 'electrolit', 'ricolino', 'de la rosa', 'canels', 'vero', 'pulparindo',
    'totis', 'chokis', 'emperador', 'florentinas', 'mamut', 'pinguinos', 'gansito', 'nito', 'tortillinas', 'wonder',
    'mission mexico', 'abuelita', 'ibarra', 'carlos v', 'la lechera', 'kern s', 'valle verde', 'great value mexico',
    'aurrera', 'el mexicano', 'la sierra', 'isadora', 'ducales', 'ades',
    'svelty', 'carnation clavel', 'sanissimo', 'nature s garden', 'pronto', 'tajin', 'valentina',
    'bufalo', 'tapatio', 'la guadalupana', 'sello rojo',
  ].map(normalizar),
);

export function esMarcaMexicana(marca: string | undefined): boolean {
  if (!marca) return false;
  const m = normalizar(marca);
  for (const x of MARCAS_MX) if (m === x || m.startsWith(x + ' ')) return true;
  return false;
}

/** GS1 México asigna el prefijo 750 (EAN-13). */
export function esCodigoMexicano(gtin13: string | undefined | null): boolean {
  return !!gtin13 && gtin13.startsWith('750');
}
