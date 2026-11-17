import { defineConfig, mergeConfig } from 'vitest/config';
import configVite from './vite.config.ts';

/**
 * Dos proyectos:
 *  - "nucleo": motor, base de datos, respaldos y pipeline de datos → entorno Node
 *    (IndexedDB simulado con fake-indexeddb dentro de cada prueba).
 *  - "interfaz": el resto (componentes, pruebas de integración) → jsdom.
 * Un archivo puede forzar otro entorno con el comentario `// @vitest-environment jsdom`.
 */
const NUCLEO = [
  'src/nucleo/**/*.test.ts',
  'src/bd/**/*.test.{ts,tsx}',
  'src/respaldo/**/*.test.ts',
  'datos/**/*.test.ts',
];

export default mergeConfig(configVite, defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'datos/crudos/**'],
    projects: [
      { extends: true, test: { name: 'nucleo', include: NUCLEO, environment: 'node' } },
      {
        extends: true,
        test: {
          name: 'interfaz',
          include: ['src/**/*.test.{ts,tsx}', 'pruebas/**/*.test.{ts,tsx}'],
          exclude: [...NUCLEO, '**/node_modules/**', 'pruebas/e2e/**'],
          environment: 'jsdom',
        },
      },
    ],
  },
}));
