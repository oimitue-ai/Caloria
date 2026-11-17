# CALORÍA

Aplicación web progresiva (PWA) en español para registrar lo que comes en segundos, controlar calorías y
macronutrientes, seguir tu peso y consultar estadísticas. Pensada para México; funciona en Android
(instalada desde Chrome) y en computadora.

**Abrir / instalar:** https://oimitue-ai.github.io/Caloria/

## Privacidad
Tus comidas, peso, perfil, recetas y alimentos propios se guardan **solo en tu dispositivo** (IndexedDB).
No hay servidor ni cuenta. Por eso es importante exportar un respaldo de vez en cuando
(Más → Respaldo y exportación: JSON, CSV o Excel). Si borras los datos del navegador o desinstalas la app,
sin respaldo se pierden.

## Catálogo nutricional
449 869 registros reales, sin valores inventados:

| Fuente | Registros | Licencia |
|---|---|---|
| USDA FoodData Central — Foundation (2026-10) | 374 | Dominio público |
| USDA FoodData Central — SR Legacy (2018-04) | 7 792 | Dominio público |
| USDA FoodData Central — FNDDS (2024-10) | 5 431 | Dominio público |
| USDA FoodData Central — Branded (2026-10) | 423 271 | Dominio público |
| Open Food Facts — productos vendidos en México | 12 955 | ODbL (conjunto separado, con atribución) |
| Platillos mexicanos por receta estandarizada (calculados desde ingredientes USDA) | 46 | — |

Detalle de fuentes, licencias y limitaciones: [`datos/FUENTES.md`](datos/FUENTES.md).
Contiene datos de Open Food Facts (https://world.openfoodfacts.org), disponibles bajo la
Open Database License (ODbL).

## Desarrollo
```bash
npm install
npm run dev            # servidor de desarrollo
npx vitest run         # pruebas unitarias
npm run build          # compilación (dist/)
```
- Arquitectura y responsables de cada módulo: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- API del motor y la base de datos: [`docs/API_NUCLEO.md`](docs/API_NUCLEO.md)
- API del buscador: [`docs/API_CATALOGO.md`](docs/API_CATALOGO.md)
- Reconstruir el catálogo desde los archivos oficiales: [`datos/README.md`](datos/README.md)
- Auditoría de calidad y pruebas E2E: [`docs/AUDITORIA.md`](docs/AUDITORIA.md), [`pruebas/README.md`](pruebas/README.md)

Cada push a `main` compila, prueba y publica en GitHub Pages (`.github/workflows/pages.yml`).

> Los cálculos de gasto energético y metas son orientativos y no sustituyen la valoración de un profesional de la salud.
