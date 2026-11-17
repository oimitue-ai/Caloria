// Ejecuta toda la auditoría E2E contra `vite preview` (BASE, por defecto http://localhost:4173/).
// Uso: node pruebas/e2e/todo.mjs [registro busqueda respaldo historial pwa pantallas robustez]
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, SALIDA, enSeccion, resultados, errores, resumen, ok } from './comun.mjs';

const SECCIONES = {
  registro: async () => (await import('./registro.mjs')).probarRegistro(),
  busqueda: async () => (await import('./busqueda.mjs')).probarBusqueda(),
  respaldo: async () => (await import('./respaldo.mjs')).probarRespaldo(), // usa el perfil de "registro"
  historial: async () => (await import('./historial.mjs')).probarHistorial(), // levanta `vite` dev en :5199
  pwa: async () => (await import('./pwa.mjs')).probarPWA(),
  pantallas: async () => (await import('./pantallas.mjs')).probarPantallas(), // usa el perfil de "registro"
  robustez: async () => (await import('./robustez.mjs')).probarRobustez(),
};

try { const r = await fetch(BASE); if (!r.ok) throw new Error(String(r.status)); } catch (e) {
  console.error(`No responde ${BASE} (${e.message}). Levanta antes: npm run build && npx vite preview --port 4173`);
  process.exit(2);
}
const pedidas = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SECCIONES);
const t0 = Date.now();
for (const s of pedidas) {
  enSeccion(s);
  const t = Date.now();
  try { await SECCIONES[s](); } catch (e) { ok(`sección ${s} terminó sin excepción`, false, e.message.split('\n')[0]); }
  console.log(`(${s}: ${((Date.now() - t) / 1000).toFixed(1)} s)`);
}
const fallas = resumen();
writeFileSync(join(SALIDA, 'resultados-e2e.json'), JSON.stringify({ fecha: new Date().toISOString(), segundos: (Date.now() - t0) / 1000, resultados, errores }, null, 1));
process.exit(fallas ? 1 : 0);
