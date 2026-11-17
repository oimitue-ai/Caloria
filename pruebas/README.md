# Pruebas de integración y auditoría (Agente 4)

## Requisitos
- Chrome en `/usr/bin/google-chrome` (o `CHROME=/ruta`), Playwright y exceljs del proyecto raíz (`npm install`).
- Herramientas propias de esta carpeta (axe-core, lighthouse): `cd pruebas && npm install`.
- Python 3 (solo biblioteca estándar) para leer las fuentes crudas de `datos/crudos/`.

## Un comando
```bash
npm run build
npx vite preview --port 4173 &          # la app compilada (BASE=http://localhost:4173/ por defecto)
node pruebas/e2e/todo.mjs               # toda la auditoría (≈5–6 min); o por sección:
node pruebas/e2e/todo.mjs registro busqueda respaldo historial pwa pantallas robustez
```
Sale con código 0 si todo pasa. Resultado completo en `pruebas/salida/resultados-e2e.json`; capturas en
`pruebas/capturas/auditoria/`. Perfiles de Chrome temporales en `/tmp/caloria-auditoria/`.

| Sección (archivo) | Qué prueba |
|---|---|
| `registro.mjs` | Asistente (TMB/GET/metas), 13 registros reales del catálogo en las 6 comidas (búsqueda + 2 códigos de barras), cambio de cantidad y unidad, eliminar/deshacer, exactitud contra el JSON oficial USDA y el TSV de OFF, sumas por comida/día, inmutabilidad del historial, persistencia tras cerrar Chrome (`launchPersistentContext`). |
| `busqueda.mjs` | 34 consultas mexicanas (incluye errores de tecleo y regionalismos): top 5 y latencia en Chrome; verifica que el índice base vive en el Web Worker. |
| `respaldo.mjs` | Exportar JSON/CSV/XLSX desde la UI y abrirlos (BOM, sumas, hojas, fórmulas); importar reemplazar/combinar; 6 respaldos inválidos; prototype pollution; XSS; inyección CSV. Requiere haber corrido `registro`. |
| `historial.mjs` | Levanta `vite` dev en :5199 y siembra 70 días con la API real (`import('/src/bd/index.ts')`); compara estadísticas 7/30/90 días, metas históricas, rachas, promedios de peso, calendario y edición de un día pasado contra un cálculo independiente. |
| `pwa.mjs` | Manifest e íconos (tamaño real del PNG), precache de `dist/sw.js`, CDP `Page.getAppManifest` / `Page.getInstallabilityErrors`, control del SW, precarga del catálogo base y uso sin conexión. |
| `pantallas.mjs` | Móvil 412×915 (touch) y escritorio 1440×900, tema claro/oscuro: desbordes y textos encimados + axe-core (WCAG 2.1 A/AA). Requiere `registro`. |
| `robustez.mjs` | Cantidades inválidas y absurdas, peso fuera de rango, BD actualizada por otra pestaña, IndexedDB no disponible, cuota llena (CDP `Storage.overrideQuotaForOrigin`). |
| `e2e.mjs` | Recorrido original del agente de interfaz (se conserva). |

## Pruebas unitarias de regresión (Vitest, corren con `npx vitest run`)
- `pruebas/relevancia.test.ts`: búsqueda sobre el catálogo publicado (huevo, arroz, queso panela, concha, traducciones, manifiesto con marcas).
- `pruebas/auditoria.test.ts`: límite de cantidad en `convertirABase`.

## Herramientas
- `python3 -I pruebas/herramientas/fuente.py usda_sr_legacy:173944 off:7501020565911 …` → valores de la fuente cruda
  (lee el zip USDA en streaming con `unzip -p`, y el TSV de OFF).
- `python3 -I pruebas/herramientas/recetas.py [id …]` → recalcula platillos de `datos/recetas_mx.json` desde USDA.
- `npx tsx pruebas/herramientas/relevancia.ts [--marcas] [consultas…]` → top 5 y tiempo del motor en Node.
- Lighthouse: `cd pruebas && CHROME_PATH=/usr/bin/google-chrome npx lighthouse http://localhost:4173/#/ --form-factor=mobile --chrome-flags="--headless=new --no-sandbox" --output=json --output-path=salida/lighthouse-movil.json`.
