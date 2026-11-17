# API del catálogo (`src/catalogo/`) — Agente 1

```ts
import { catalogo } from './catalogo';            // export const catalogo: ServicioCatalogo
import type { ResultadoBusqueda, Alimento } from './tipos';

const manifiesto = await catalogo.iniciar();      // idempotente; descarga el índice base (o lo toma de caché)
const r = await catalogo.buscar('leche deslactosada lala', { limite: 25, pagina: 0, senal: ctrl.signal });
// r.resultados: ResultadoBusqueda[] ordenados por puntuación; r.hayMas; r.parcial (true si marcas no respondió: sin red)
const a: Alimento | null = await catalogo.obtener(r.resultados[0].id);   // detalle completo (porciones, micros…)
const b = await catalogo.porCodigoBarras('7501020565911');              // EAN-13/UPC-A/UPC-E/EAN-8; null si no existe
catalogo.manifiesto();                            // ManifiestoCatalogo | null (fuentes, licencias, conteos)
```

Comportamiento
- `buscar` tolera mayúsculas, acentos, plurales, sinónimos regionales/bilingües (plátano↔banana, jitomate↔tomate,
  elote↔maíz, puerco↔cerdo…) y errores de tecleo ("platno", "quezo", "tortila"). La última palabra se trata como prefijo
  (búsqueda mientras se escribe). Texto vacío → `{ resultados: [], hayMas: false }`.
- Orden: si la consulta nombra una marca, primero esa marca; si no, genéricos mexicanos y oficiales arriba y nombres
  cortos mejor puntuados. `incluirMarcas: false` busca solo en el catálogo base (offline, instantáneo).
- El catálogo **base** (genéricos USDA traducidos + platillos mexicanos por receta) se busca en memoria dentro de un
  Web Worker y se guarda en Cache Storage (`caloria-catalogo-<version>`): funciona sin conexión tras la primera carga.
  Las **marcas** (USDA Branded, Open Food Facts) se consultan por fragmentos remotos con caché; sin red → `parcial: true`.
- `senal` (AbortSignal) cancela la búsqueda: la promesa se rechaza con `DOMException('AbortError')`.
  Recomendado: debounce ~150 ms + abortar la búsqueda anterior al teclear.
- `obtener(id)` acepta cualquier id del catálogo (`usda_sr_legacy:173944`, `caloria_recetas:tacos-pastor`,
  `off:7501…`). Devuelve `null` si no existe o si es de marcas y no hay red.
- Nutrientes por 100 g o 100 ml (`base`). Valor ausente = dato faltante (no 0). `porciones[]` trae medidas caseras
  (`unidad`: pieza/taza/cucharada/cucharadita/porcion, `equivalencia` en g o ml); `predeterminada` marca la sugerida.
- `validacion`: `oficial` (tabla oficial), `etiqueta` (fabricante), `comunidad` (OFF), `receta_estandar`
  (calculado por receta; su `notas` dice "valor estimado por receta estandarizada; la preparación real varía").
- `nombreTraducido: true` → nombre traducido automáticamente del inglés; mostrar `nombreOriginal` en el detalle.
- Atribución obligatoria en la pantalla "Acerca de / Fuentes": usar `manifiesto().fuentes[*].atribucion` y `licencia`
  (Open Food Facts exige mención ODbL; los productos OFF muestran `fuente: 'off'`).

Extras (opcionales) exportados por `src/catalogo/index.ts`
- `precargarCatalogoBase(): Promise<void>` — descarga y cachea todos los detalles base (para "usar sin conexión").
- `normalizar(texto)` — la misma normalización del buscador (minúsculas, sin acentos).

PWA: los archivos viven en `public/catalogo/` (URL `import.meta.env.BASE_URL + 'catalogo/'`). No conviene precachear
`catalogo/marcas/**` con Workbox (cientos de MB); `catalogo/base/**` y `manifiesto.json` ya se cachean desde el cliente.

## Detalles de implementación (versión actual)

- Exporta también `crearServicioCatalogo({ cargador, usarWorker, urlBase })` (pruebas: cargador de archivos locales,
  `usarWorker: false`), `ServicioCatalogoLocal`, `normalizarCodigoBarras`, `tokenizar`.
- `catalogo.precargarBase()` / `precargarCatalogoBase()`: descarga los 12 detalles base (~15 MB sin comprimir).
- `ResultadoBusqueda` de marcas trae `kcal` y `marca` (proteína/carbohidratos/grasa solo en `obtener`).
- Tiempos medidos (Node, archivos locales): base en memoria ≈ 2 ms por consulta; con marcas en frío ≈ 50 ms
  (+ latencia de red de 1–4 fragmentos de ≤ 250 KB por fuente).
- Formato publicado (`public/catalogo/`):
  - `manifiesto.json` — `ManifiestoCatalogo` + `formato`, `base.{indices,detalles}`, `marcas.fuentes`, `limpieza`
    (descartes por motivo, atípicos, duplicados), `duplicados`, `recetas`, `archivos`.
  - `base/indice-NNN.json` `{formato, filas}`; fila = `[id, nombre, nombreOriginal|'', sinonimos 'a|b', categoria,
    marca, fuente, validacion, base, kcal, proteina, carbohidratos, grasa, [etiqueta, unidad, equivalencia]|0,
    mexicano 0/1, nº de detalle, atipico 0/1]`. `base/detalle-NNN.json` `{ id: Alimento sin id }`.
  - `marcas/<fuente>/terminos/_directorio.json` (prefijos) y `terminos/<prefijo>.json` `{término: [df, clave, partes,
    df como marca]}` (directorio de frecuencias); `marcas/<fuente>/indice/<clave>[.<parte>].json`
    `{término: [[idOriginal, nombre, marca, kcal, banderas(1 ml, 2 mexicano, 4 atípico)], …]}` ordenadas por relevancia
    estática; `marcas/<fuente>/detalle/<hash32(idOriginal) % cubetas>.json`; `marcas/<fuente>/info.json`.
  - `marcas/codigos/_directorio.json` + `marcas/codigos/<prefijo>.json` `{gtin13: [ids]}`.
