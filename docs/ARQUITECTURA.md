# CALORÍA — Arquitectura

## Decisión principal: PWA "local-first" + catálogo estático fragmentado

- **App**: Vite + React 19 + TypeScript + Tailwind 4, instalable como PWA (vite-plugin-pwa / Workbox).
- **Datos del usuario** (perfil, metas, comidas, recetas, alimentos propios, peso): IndexedDB vía Dexie,
  en el dispositivo. Sin servidor ni cuenta: no hay credenciales que proteger ni servicio que pagar o
  que pueda desaparecer. Se pide almacenamiento persistente (`navigator.storage.persist()`).
  Limitación: los datos viven en el dispositivo → respaldo/restauración en JSON, exportación CSV y Excel,
  y recordatorio periódico de respaldo.
- **Catálogo nutricional** (cientos de miles de registros): se construye fuera de línea con un pipeline
  (`datos/`) y se publica como archivos estáticos en `public/catalogo/`:
  - `base/`: alimentos genéricos + mexicanos (decenas de miles). Se descargan completos, se guardan en
    caché y se buscan en memoria dentro de un Web Worker → funciona sin conexión.
  - `marcas/`: productos comerciales (USDA Branded, Open Food Facts). Índice fragmentado por prefijo de
    término + fragmentos de detalle + fragmentos por código de barras. El cliente solo baja los
    fragmentos que la consulta necesita (KB, no MB). Open Food Facts se mantiene como conjunto separado (ODbL).
  - `manifiesto.json`: fuentes, versiones, licencias, conteos reales.
- **Hosting**: cualquier hosting estático con HTTPS (sin backend). La app usa rutas relativas (`base: './'`)
  y HashRouter para funcionar en cualquier subruta.

## Módulos y dueños (no tocar archivos de otro dueño)

| Carpeta | Dueño | Contenido |
|---|---|---|
| `src/tipos.ts`, configuración raíz | Orquestador | Contrato de tipos |
| `datos/`, `public/catalogo/`, `src/catalogo/` | Agente 1 | Pipeline de importación, catálogo, buscador cliente |
| `src/nucleo/`, `src/bd/`, `src/respaldo/` | Agente 2 | Motor de cálculo, persistencia, respaldos |
| `src/ui/`, `src/App.tsx`, `src/main.tsx`, `index.html`, `public/` (íconos), PWA | Agente 3 | Interfaz |
| `pruebas/`, `docs/AUDITORIA.md` | Agente 4 | Pruebas de integración/E2E y auditoría |

Pruebas unitarias: junto a cada módulo (`*.test.ts`), con Vitest.
