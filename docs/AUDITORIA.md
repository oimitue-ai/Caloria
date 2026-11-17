# CALORÍA — Auditoría de calidad (Agente 4)

Fecha: 2026-11-16/17. Entorno: Chrome real (`/usr/bin/google-chrome`, headless) con Playwright contra `vite preview`
(build de producción) y, para sembrar datos, `vite` dev. Todo lo que aparece aquí se ejecutó; las cifras son de las
corridas reales (salidas en `pruebas/salida/`, capturas en `pruebas/capturas/auditoria/`). Cómo repetirlo:
[`pruebas/README.md`](../pruebas/README.md).

## Resultado final (después de las correcciones)

| Comando | Resultado |
|---|---|
| `npx vitest run` | 14 archivos, **140/140** (eran 132; +8 de regresión en `pruebas/`) |
| `npx tsc --noEmit -p tsconfig.app.json` | sin errores |
| `npm run build` | correcto; precache 53 entradas (47 únicas), 2 180 KiB |
| `node pruebas/e2e/todo.mjs` (7 secciones de la auditoría) | **280/280** comprobaciones (≈ 2.5 min); único error de consola: el `net::ERR_FAILED` esperado de un fragmento de marcas pedido sin conexión |
| `node pruebas/e2e/e2e.mjs` (recorrido original del agente de interfaz) | 41/41 |
| Lighthouse 13.6 (`npx lighthouse`, Chrome headless) | Móvil: rendimiento 90, accesibilidad 98, buenas prácticas 100 (FCP 0.8 s, LCP 3.4 s, TBT 110 ms, CLS 0). Escritorio: 100 / 98 / 100 (LCP 0.7 s). Lo único que bajó accesibilidad: `landmark-one-main` en la pantalla de bienvenida |

## Pruebas realizadas

1. **Registro real desde el catálogo** (`registro.mjs`). Asistente completo; luego 13 registros en las 6 comidas, buscando en
   la UI: plátano, leche deslactosada lala (OFF, ml), huevo, licuado de plátano (receta), código OFF México
   `7500478002801` (Cremax, Pepsi Co.), tortilla de maíz (cambio de unidad a "1 tortilla (24 g)"), frijoles refritos (½ taza),
   UPC-A de USDA Branded `795709010077` (yogur Wallaby), arroz, pozole, barbacoa (cambio a gramos), coca cola (ml).
   Después: editar cantidad, cambiar unidad (taza → 120 g), eliminar y deshacer, deshacer "Agregado", alimento propio
   editado (historial inmutable) y **persistencia**: cerrar Chrome y abrir otra vez el mismo `userDataDir`. 90/90.
2. **Búsqueda** (`busqueda.mjs`, `pruebas/relevancia.test.ts`, `pruebas/herramientas/relevancia.ts`). 34 consultas, entre
   ellas errores de tecleo (platno, tortila, quezo oaxaca) y regionalismos (jitomate, elote, chícharo, cacahuate, bolillo,
   telera, concha, panela…). Latencia en Chrome, medida desde que se teclea hasta que los resultados están en pantalla
   (incluye el debounce de 120 ms y los fragmentos de marcas): **mediana 215 ms, p95 323 ms, máx. 450 ms**. La primera
   búsqueda, en frío, tarda 342 ms. En el motor base, en Node: 0.1–10 ms por consulta. **Web Worker**: `assets/worker-*.js`
   está activo y los 3 `base/indice-*.json` se descargan dentro del worker (0 en el hilo principal, según la Performance
   API de cada contexto).
3. **Exactitud.** Ver la tabla de abajo. También: recetas recalculadas desde los ingredientes USDA
   (`pruebas/herramientas/recetas.py`), conversiones de unidades con alimentos reales, TMB/GET/metas, sumas por comida y
   por día, estadísticas y promedios de peso (contra un cálculo independiente en `historial.mjs`) y una muestra aleatoria
   de 50 traducciones (semilla 20261116).
4. **Persistencia e inmutabilidad**: incluidas en `registro.mjs`. `navigator.storage.persisted()` = false en headless
   (Chrome la concede si se instala o según el uso del sitio).
5. **Exportar/importar** (`respaldo.mjs`). Exportes desde la UI, abiertos y verificados:
   - JSON: los conteos coinciden y la SHA-256 se verifica fuera de la app.
   - CSV: tiene BOM y CRLF, 1 fila por registro, la suma de kcal coincide con la BD y los acentos están intactos.
   - CSV de peso: correcto.
   - XLSX (exceljs): tiene las 5 hojas, la suma de la hoja Comidas y el total de hoy en "Resumen diario" coinciden con la
     BD, y no hay ninguna celda con fórmula.
   - Importar: "reemplazar" en un perfil nuevo deja exactamente lo del respaldo; "combinar" el mismo respaldo agrega
     0; "combinar" otro respaldo agrega 3 registros y 1 peso.
6. **Calendario, historial y estadísticas** (`historial.mjs`). Se sembraron 126 registros y 35 pesos en 70 días con
   `agregarRegistros`, `registrarPeso` y `guardarMetas` reales (dos metas: 2000 y, desde hace 30 días, 1800). Se revisaron
   7, 30 y 90 días, el calendario del mes y la edición y el cambio de comida en un día pasado. 22/22.
7. **PWA** (`pwa.mjs`): ver la sección de resultados PWA. 21/21.
8. **Escritorio 1440×900 y Android 412×915 (touch, DPR 2)** (`pantallas.mjs`). 12 pantallas, más la hoja de registro con
   resultados y el panel de cantidad, en tema claro y oscuro. La detección automática de desbordes horizontales y textos
   encimados dio 0 casos. Además revisé capturas a mano (día en escritorio, calendario y panel en móvil): no hay desbordes.
   El aviso "Nueva versión disponible" tapa el título mientras no se responde (ver pendientes).
9. **Seguridad y robustez** (`respaldo.mjs`, `robustez.mjs`):
   - Cantidades −5, 0, "abc" y vacía: rechazadas. "1,5": aceptada como 1.5.
   - Peso −3, 0, 1000 y "abc": rechazados.
   - 6 respaldos inválidos rechazados con mensaje en español: no es JSON, otra app, suma alterada, cantidad negativa
     firmada, versión 99, tabla que no es lista.
   - Respaldo malicioso firmado con `__proto__`/`constructor.prototype` en `datos`, `perfil` y `micros`, y con
     `<script>`/`<img onerror>` en nombres: `Object.prototype` queda intacto, no se ejecuta nada y el perfil no conserva
     la clave `__proto__`.
   - XSS con un alimento propio nombrado `<img src=x onerror=…>`: se muestra como texto.
   - `=HYPERLINK(…)`: en el CSV sale como `'=HYPERLINK…` y en el XLSX como texto.
   - Otra pestaña abre la BD en la versión 9999: la app sigue registrando.
   - Cuota llena (CDP `Storage.overrideQuotaForOrigin`): se avisa, aunque en inglés (pendiente P5).
   - IndexedDB no disponible: ver C3.
10. **Accesibilidad y rendimiento**: axe-core 4.14 (WCAG 2.1 A/AA) en 14 vistas × 2 tamaños, y Lighthouse (arriba).

## Tabla de verificación matemática contra la fuente

Fuente: JSON oficial de FoodData Central dentro del zip (`unzip -p`, objeto por `fdcId`) y el TSV de OFF México. App:
el registro guardado en IndexedDB tras capturarlo en la UI. Valor esperado = valor de la fuente por 100 × cantidad base
/ 100. Tolerancia: 0.5 % o 0.05.

| # | Alimento (id) | Captura en la UI | Base | kcal app / fuente | Proteína | Carbohidratos | Grasa |
|---|---|---|---|---|---|---|---|
| 1 | Plátano (`usda_sr_legacy:173944`, *Bananas, raw*) | 2 × pieza mediana (118 g) | 236 g | 210.04 / 210.04 | 2.57 / 2.57 | 53.81 / 53.81 | 0.78 / 0.78 |
| 2 | Leche deslactosada Lala (`off:75042707`) | 250 ml | 250 ml | 119.75 / 119.70¹ | 7.80 / 7.80 | 12.00 / 12.00 | 4.50 / 4.50 |
| 3 | Huevo entero, crudo (`usda_sr_legacy:171287`) | 2 × pieza grande (50 g) | 100 g | 143.00 / 143.00 | 12.60 / 12.60 | 0.72 / 0.72 | 9.51 / 9.51 |
| 4 | Cremax chocolate (`off:7500478002801`, por código) | 30 g | 30 g | 152.01 / 152.00¹ | 1.00 / 1.00 | 19.00 / 19.00 | 8.00 / 8.00 |
| 5 | Tortilla de maíz (`usda_sr_legacy:175036`) | 3 × 1 tortilla (24 g) | 72 g | 156.96 / 156.96 | 4.10 / 4.10 | 32.11 / 32.11 | 2.05 / 2.05 |
| 6 | Frijoles refritos (`usda_fndds:2707396`) | ½ taza (260 g) | 130 g | 117.00 / 117.00 | 6.47 / 6.47 | 17.68 / 17.68 | 2.61 / 2.61 |
| 7 | Yogur Wallaby (`usda_branded:405016`, UPC-A) | 170 g | 170 g | 139.40 / 139.40 | 7.00 / 7.00 | 22.95 / 22.95 | 2.50 / 2.50 |
| 8 | Arroz blanco, cocido (`usda_sr_legacy:168878`) | 1 taza (158 g) | 158 g | 205.40 / 205.40 | 4.25 / 4.25 | 44.56 / 44.56 | 0.44 / 0.44 |
| 9 | Coca-Cola (`off:7501055341344`) | 355 ml | 355 ml | 106.50 / 106.50 | 0 / 0 | 26.63 / 26.63 | 0 / 0 |
| 10 | Tortilla de maíz (2.ª captura) | 1 tortilla | 24 g | 52.32 / 52.32 | 1.37 / 1.37 | 10.70 / 10.70 | 0.68 / 0.68 |
| 11 | Edición: plátano 2 → 1.5 piezas | — | 177 g | 157.53 (= 0.89 × 177) | | | |
| 12 | Edición: frijoles taza → 120 g | — | 120 g | 108.00 (= 0.90 × 120), sin porción | | | |

¹ El catálogo redondea las kcal de OFF a 1 decimal (47.88 → 47.9; 506.67 → 506.7). La diferencia es ≤ 0.05 kcal.

Recetas recalculadas desde los ingredientes USDA (por 100 g):

| Platillo | Peso total | Cálculo independiente (kcal/P/C/G) | App | Porción en la UI |
|---|---|---|---|---|
| Licuado de plátano (leche 250 ml → 257.8 g con la densidad oficial de 1 fl oz) | 383.8 g | 76.40 / 2.45 / 12.32 / 2.28 | igual | 1 vaso = 293 kcal ✓ |
| Pozole rojo (plato servido) | 513 g | 78.95 / 5.18 / 6.05 / 3.75 | 79 / 5.18 / 6.05 / 3.75 | 1 plato = 405 kcal ✓ |
| Barbacoa de res | 1 064 g | 290.32 / 28.55 / 1.30 / 18.17 | 290.3 / … igual | 150 g = 435 kcal ✓ |

Unidades con alimentos reales: plátano (g, sin densidad) ofrece solo sus porciones, g y kg; "100 ml" y "1 cucharada" se
rechazan con un motivo en español. Leche entera SR 171265: densidad 1.031 g/ml, tomada de la porción "1 fl oz = 30.5 g";
100 ml → 103.1 g; 1 taza = 244 g (porción oficial). Leche Lala (base ml): taza = 240 ml y "100 g" se rechaza (no tiene
densidad). Aceite de oliva sin densidad: no ofrece ml; la cucharada usa la porción oficial de 13.5 g. ✓

Sumas: el total del día en la UI (2 536 kcal) es igual a la suma de los registros; las 6 sumas por comida también
coinciden. Hay una diferencia visual por redondeo por fila: 158 + 120 = 278 en pantalla, contra un desayuno de 277
(157.53 + 119.75 = 277.28). Es aceptable. "404 kcal de más", 119 % ✓.

TMB y metas (hombre, 34 años, 172 cm, 82 kg, actividad moderada, bajar 0.5 kg/semana):
- TMB = 10·82 + 6.25·172 − 5·34 + 5 = **1 730**.
- GET = 1 730 × 1.55 = 2 681.5 → **2 682**.
- Meta = 2 681.5 − 550 = 2 131.5 → **2 132**.
- Macros: proteína 1.8 g/kg → **148 g**; grasa 27.5 % → **65 g**; carbohidratos → **239 g**.

Todo coincide con lo que muestra la UI ✓.

Estadísticas, calculadas aparte sin usar `src/nucleo`:

| Periodo | Promedio | Días registrados | Cumplimiento | Racha máx. / actual |
|---|---|---|---|---|
| 7 días | 1 829 | 6 de 7 | 2/6 = 33 % | 6 / 0 |
| 30 días | 1 832 | 26 de 30 | 13/26 = 50 % | 8 / 0 |
| 90 días | 1 834 | 63 de 90 | 31/63 = 49 % | 8 / 0 |

En los 90 días, la meta promedio de 1 914 confirma que se usa la meta vigente de cada día. La UI muestra exactamente lo
mismo. Los promedios semanales (lunes a domingo) y mensuales del peso coinciden con ±0.05 kg ✓.

**Traducciones (muestra aleatoria de 50).** 4 eran graves porque cambian lo que el usuario cree que es el alimento:
"Bebida, aerosol de mar" (Ocean Spray), "(incluye café y servir)" (brown-and-serve), "Papas fritas de pretzel" y
"con whitener". Están corregidas. Unas 8 son torpes pero entendibles: "labio off", "cap-off", "Pay, mince",
"microwavable", "leche añadida descremada sólidas", "Mezcla de mariscos y zanahoria de verduras incluyendo…" (pendiente P4).
Fuera de la muestra encontré y corregí también: "Plátano partido" (Banana split, 975 kcal por porción, aparecía 4.º al
buscar "plátano"), "Concha de pay" (Pie shell), "Refresco Freezer" (Freezer pop) y "Chocolate de atole de".

## Errores encontrados y corregidos

| # | Gravedad | Error | Corrección (archivo) | Prueba que lo cubre |
|---|---|---|---|---|
| C1 | **Alta** | Sin conexión se podía buscar en el catálogo base, pero al abrir un alimento no usado antes salía "No se pudo cargar este alimento". Solo se guardaban los 3 índices, no los 12 detalles, lo que contradice ARQUITECTURA ("base/ se descarga completo… funciona sin conexión"). `precargarCatalogoBase` existía, pero nadie la llamaba. | `src/ui/servicios/catalogo.ts` (`precargarCatalogoEnSegundoPlano`, respeta Save-Data y sin conexión) y `src/App.tsx` (se lanza 4 s después de abrir, en `requestIdleCallback`). ≈2.4 MB comprimidos. | `pwa.mjs`: "precarga… 12 detalles" (3.1 s) y "sin conexión: se puede abrir y registrar un alimento base no usado antes" |
| C2 | **Alta** | Las cantidades no tenían límite superior: "1e300" piezas se guardaba (1.05e302 kcal) y "Consumidas" mostraba un número de 300 dígitos; "999999" piezas de plátano (118 t) también se aceptaba. Esto rompe totales, estadísticas y exportes. | `src/nucleo/unidades.ts`: `MAXIMO_CANTIDAD_BASE` = 100 000 g o ml por captura, con el motivo "La cantidad es demasiado grande…". El panel deshabilita "Agregar" y muestra el motivo. | `pruebas/auditoria.test.ts`, `robustez.mjs` |
| C3 | Media | Sin IndexedDB (modo privado o almacenamiento bloqueado), la app se quedaba en "Cargando…" para siempre, sin explicación. | `src/App.tsx`: abre la BD al iniciar y, si falla, muestra la pantalla "No se pueden guardar datos" con la causa probable. | `robustez.mjs` ("sin IndexedDB…") |
| C4 | Media | "queso panela" sin conexión devolvía solo **"Azúcar morena"**: el sinónimo suelto `panela` coincidía con el sinónimo "panela de azúcar" del piloncillo. | `src/catalogo/sinonimos.ts`: `queso panela\|queso de panela` | `relevancia.test.ts` |
| C5 | Media | Traducciones que cambian la identidad del alimento (35 nombres): Banana split → "Plátano partido", Pie shell → "Concha de pay", Freezer pop → "Refresco Freezer", Ocean Spray → "aerosol de mar" (×20), brown-and-serve, pretzel chips, whitener, "Chocolate de atole de", salvadoran. | `datos/pipeline/glosario.ts` (13 entradas). Catálogo base reconstruido con `npm run construir -- --solo=base`: se comprobó que solo cambiaron esos 35 nombres; nutrientes, ids y porciones quedaron iguales. | `relevancia.test.ts` |
| C6 | Media | Ranking: con "huevo", "Huevo entero, crudo" salía en el lugar 11; con "arroz", "Arroz blanco, cocido" en el 12; con "avena", primero "Avena, inflada". | `src/catalogo/motor.ts`: los descriptores neutros (crudo, cocido, entero, natural, blanco, fresco, hervido) ya no cuentan como palabras extra al premiar los nombres cortos. Ahora salen en los lugares 2, 3 y 1. | `relevancia.test.ts`, `busqueda.mjs` |
| C7 | Media | "concha" devolvía la base para pay (508 kcal) y no el pan dulce. | Sinónimo `concha` ↔ "pan dulce con cobertura de azúcar" y C5. | `relevancia.test.ts` |
| C8 | Media (pipeline) | `npm run construir -- --solo=base` **borraba la sección `marcas` de `manifiesto.json`**: el cliente dejaba de buscar productos de marca. Lo detecté al reconstruir para C5. | `datos/pipeline/publicar.ts`: con `--solo=base` se conserva `marcas` del manifiesto anterior. | `relevancia.test.ts` ("el manifiesto conserva la sección de marcas") |
| C9 | Crítica para axe (a11y) | El calendario tenía `role="grid"` con celdas `gridcell` fuera de cualquier `row`, lo que dispara `aria-required-children` y `aria-required-parent`, de impacto crítico. | `src/ui/pantallas/Calendario.tsx`: filas por semana `role="row"` con `display: contents`, sin cambiar el diseño. | `pantallas.mjs` (axe) |

## Errores pendientes (no corregidos: son decisiones de diseño o datos, o no tienen una corrección acotada)

| # | Gravedad | Descripción |
|---|---|---|
| ~~P1~~ | Media | **CORREGIDO por el orquestador** (ver abajo). La porción predeterminada de "Tortilla de maíz" (SR 175036) es "**1 enchilada (19 g)**" y no "1 tortilla (24 g)". La regla del pipeline (`porciones.ts`) toma la primera porción de tipo pieza. Al registrar "1" se cuentan 19 g en lugar de 24. |
| P2 | Media (a11y) | Contraste por debajo de AA en: números de días futuros del calendario (2.95:1), etiquetas blancas sobre la barra de macros de Estadísticas (3.7:1) y textos pequeños en Perfil y en el panel de cantidad. Son colores del sistema de diseño. `pantallas.mjs` las reporta como nota (no como falla) mientras sigan pendientes. |
| P3 | Baja (a11y) | `label-content-name-mismatch`: el `aria-label` de las filas del día omite la marca y los macros visibles. El de la celda de hoy en el calendario tampoco coincide con su texto visible. |
| P4 | Baja | ≈16 % de la muestra tiene palabras sin traducir o un orden torpe ("labio off", "1 quart", 'pieza mediano (7" a 7 - 7/8" largo)', "sartén de torta salvadoreña", "1 cubo de porción 1"). |
| ~~P5~~ | Baja | **CORREGIDO por el orquestador** (ver abajo). Con la cuota de almacenamiento llena, el aviso dice "QuotaExceededError" (en inglés y técnico). |
| P6 | Baja | Los detalles base se guardan dos veces: en la caché propia `caloria-catalogo-<versión>` y en la caché de Workbox `caloria-catalogo-base`, que es CacheFirst y no se limpia al cambiar de versión. Son ≈15 MB extra por versión. |
| P7 | Baja | El precache incluye exceljs (908 KiB de 2 180 KiB), que solo se usa en Respaldo. Es razonable si se quiere exportar sin conexión. |
| P8 | Baja | Sin conexión, "panela" sola → "Azúcar morena" (sinónimo de los datos); "queso panela" → sin resultados, porque USDA no tiene queso panela (con red aparecen productos OFF). |
| P9 | Info | "Racha actual" vale 0 hasta que se registra algo hoy (así está definido en el núcleo). Puede desanimar por la mañana. |
| P10 | Info | El aviso "Nueva versión disponible" (arriba) tapa el título de la pantalla o de la hoja mientras no se responde. |
| P11 | Info | Datos OFF (comunidad): varias Coca-Cola México con 30 kcal/100 ml (coinciden con el TSV), y una registrada "por 100 g". No es un error de la app. |

## Correcciones posteriores del orquestador

| # | Qué | Dónde | Verificación |
|---|---|---|---|
| P1 | La porción predeterminada descarta piezas que nombran **otro** platillo (USDA da "1 enchilada" / "1 taco" como medida de la tortilla). Al reconstruir el catálogo base solo cambió **1 de 13 643** registros (Tortilla de maíz: "1 enchilada (19 g)" → "1 tortilla (24 g)"); ningún nutriente cambió. | `datos/pipeline/porciones.ts` (`indicePredeterminada`), `datos/pipeline/importar.ts` | Prueba nueva en `datos/pipeline/pipeline.test.ts`; comparación registro a registro antes/después |
| P5 | Errores técnicos del navegador (cuota llena, BD bloqueada, sin red) se muestran en español con una acción sugerida. | `src/ui/componentes/Avisos.tsx` (`traducirErrorTecnico`) | `robustez.mjs`: "El almacenamiento del dispositivo está lleno…" |

Re-ejecución final tras estas correcciones: `npx vitest run` 141/141, `tsc` 0 errores, `npm run build` correcto, `node pruebas/e2e/todo.mjs` **280/280**.

## Resultados PWA

- Manifest: `name`/`short_name` CALORÍA, `lang` es-MX, `start_url`/`scope`/`id` "./", `display` standalone, colores, 2
  atajos. Los íconos existen y su tamaño real coincide (se leyó el encabezado PNG): 192×192 any, 512×512 any, 512×512
  maskable y SVG any.
- CDP `Page.getAppManifest`: 0 errores. `Page.getInstallabilityErrors`: **0** con un perfil persistente; en un contexto
  incógnito sale `in-incognito`, que es lo esperado.
- El service worker controla la página tras recargar. La app abre sin conexión (shell precacheado).
- Precache: **no incluye `catalogo/`** (ni marcas ni base). Son 53 entradas, 47 únicas (las duplicadas son íconos que
  vienen de `includeAssets` y del manifest con la misma revisión), 2 180 KiB sin comprimir. Los más pesados: exceljs
  908 KiB, Graficas 401 KiB, index 243 KiB.
- Sin conexión: el catálogo base busca genéricos y mexicanos, y "coca cola" degrada a genéricos con el aviso "Sin
  conexión: faltan productos de marca". Después de C1, se abre y se registra un alimento base no usado antes.

## Archivos de la auditoría

- `pruebas/e2e/{comun,registro,busqueda,respaldo,historial,pwa,pantallas,robustez,todo}.mjs`: la suite E2E (comando
  único: `node pruebas/e2e/todo.mjs`). `e2e.mjs` es el recorrido original y se conserva.
- `pruebas/relevancia.test.ts` y `pruebas/auditoria.test.ts`: regresiones con Vitest.
- `pruebas/herramientas/fuente.py`, `recetas.py`, `relevancia.ts`: comparación contra las fuentes crudas.
- `pruebas/package.json`: axe-core y lighthouse, aislados del `package.json` raíz.
- `pruebas/salida/`: exportes descargados, JSON de resultados, `axe.json`, `lighthouse-{movil,escritorio}.json`.
