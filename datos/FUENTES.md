# Fuentes del catálogo nutricional de CALORÍA

Regla general: solo se publica lo que tiene **procedencia y licencia verificables**. Cada registro conserva
`fuente`, `idOriginal`, `nombreOriginal` y `actualizado`; los valores originales de la fuente (nutrientes con su id
USDA y unidad, porciones crudas, códigos, campos OFF) se guardan aparte en `datos/salida/procedencia/<fuente>.ndjson`
(no se publican). Los archivos descargados se tratan como datos no confiables: no se ejecutó código de ningún
repositorio; solo se leyeron datos y documentación.

## Fuentes usadas (archivos oficiales)

| Fuente (`FuenteId`) | Archivo / versión | URL oficial | Licencia | Registros publicados |
|---|---|---|---|---|
| `usda_foundation` | `FoodData_Central_foundation_food_json_2026-10-29.zip` | https://fdc.nal.usda.gov/download-datasets | Dominio público / CC0 1.0 | 374 |
| `usda_sr_legacy` | `FoodData_Central_sr_legacy_food_json_2018-04.zip` (versión final de SR) | idem | Dominio público / CC0 1.0 | 7 792 |
| `usda_fndds` | `FoodData_Central_survey_food_json_2024-10-31.zip` (FNDDS 2021-2023, `surveyDownload.json`) | idem | Dominio público / CC0 1.0 | 5 431 |
| `usda_branded` | `FoodData_Central_branded_food_json_2026-10-29.zip` (JSON de 3.17 GB, leído en streaming) | idem | Dominio público / CC0 1.0 | 423 271 |
| `off` | `datos/crudos/off/off_mexico.tsv.gz`: volcado CSV oficial de Open Food Facts filtrado a productos vendidos en México (18 673 filas, encabezado original) | https://world.openfoodfacts.org/data | **ODbL 1.0** (base de datos) + **DbCL 1.0** (contenidos) | 12 955 |
| `caloria_recetas` | `datos/recetas_mx.json` (46 platillos) | — | Cálculo propio sobre ingredientes USDA | 46 |

USDA FoodData Central: la USDA publica los datos como dominio público (CC0 1.0); cita sugerida:
*U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.* La USDA no respalda esta app.

Open Food Facts (ODbL): **conjunto separado**. Sus valores nunca se fusionan con los de otra fuente: cuando un mismo
código de barras está en USDA Branded y en OFF (334 casos), ambos registros se publican por separado y se enlazan
con `equivalentes`. Atribución obligatoria en la app: «Datos de Open Food Facts (https://world.openfoodfacts.org),
disponibles bajo la Open Database License». Si se redistribuye la base de datos derivada (`public/catalogo/marcas/off/`),
debe ofrecerse bajo ODbL (share-alike). Los demás conjuntos no quedan afectados porque no se mezclan.

## Fuentes de apoyo (espejos en `datos/crudos/_espejos/`, clonados de GitHub)

| Espejo | Procedencia | Licencia | Uso |
|---|---|---|---|
| `Ronyol012_Food-Full-Data-Base` (v0.4.0) | github.com/Ronyol012/Food-Full-Data-Base | Datos: **CC BY 4.0**; código MIT | **Usado**: 875 nombres en español escritos a mano para SR Legacy (`traduccion = curada`) y sus alias, enlazados por `fdc_id`, con ajustes de vocabulario de México (guisante→chícharo, patata→papa…). Atribución en el manifiesto. Sus valores nutricionales no se usan (se toman del JSON oficial). |
| `matiasmorant_nutrition` | github.com/matiasmorant/nutrition | Sin LICENSE en el repo; el contenido es USDA (dominio público) | Solo **verificación**: CSV de SR Legacy y Foundation 2025-04-24 con los mismos conteos que el oficial (`all_downloaded_table_record_counts.csv`: food 7793, food_nutrient 644 125, food_portion 14 449); `surveyDownload.json` idéntico en tamaño (66 294 426 B) al miembro del zip oficial. El pipeline lo usa como respaldo de FNDDS solo si falta el zip oficial. |
| `codejet_release/foods-US.zip` + `CodeJetNet_food-data` | github.com/CodeJetNet/food-data, release `data-20261019-7` (manifest con md5) | Base de datos **ODbL** (incluye OFF); scripts MIT | **No usado** en el catálogo: SQLite de 245 MB con USDA Branded/SR/FNDDS/Foundation + OFF EE. UU. ya fusionados por código de barras (primera fuente gana) y filtrados; perdió fechas por registro y la base ml de OFF, y su licencia ODbL contaminaría los datos USDA. Sirvió para revisar reglas de calidad (energía 4/4/9, GTIN-13). |
| `Kamesas_food-data` | github.com/Kamesas/food-data | sin licencia de datos explícita | No usado (nombres en ucraniano/ruso). |
| `AntoineB33_food`, `objectgraph_myfoodanalysis-data` | GitHub | MIT (código) | No usados (scripts/curación sin datos publicables útiles). |

## Fuentes mexicanas buscadas (honestidad sobre lo que NO se pudo usar)

- **Base de Alimentos de México (BAM), INSP, v18.1.1 (2019, ~1 980 alimentos)**: no tiene descarga pública; se obtiene
  por solicitud a la investigadora responsable. No se usó. El pipeline reserva `mx_bam` para cuando se obtenga con
  permiso escrito.
- **Tabla de composición de alimentos extendida 2019 (INCMNSZ, publicada por CONABIO en SIAgro, 3 928 alimentos,
  17 grupos)**: la descarga requiere cuenta registrada en nutricion-siagro.conabio.gob.mx. Los documentos públicos
  (`Detalles_tecnicos.pdf`, `Diccionario_datos.pdf`) describen 4 tablas (Registro, Característica cuantitativa,
  Método, Referencias) pero **no indican licencia** de los datos; el orquestador reporta CC BY 4.0 para los
  diccionarios, y no se encontró una declaración equivalente para los valores. No se encontró ninguna copia en
  GitHub con licencia verificable. **No se usó.** Reservado como `mx_conabio`; importarla solo con licencia confirmada.
- No se encontraron en GitHub tablas LATINFOODS/nacionales latinoamericanas con licencia abierta verificable.
- El Sistema Mexicano de Alimentos Equivalentes no se usó (no es libre).

## Platillos mexicanos (`caloria_recetas`)

Calculados por el pipeline a partir de ingredientes oficiales importados (71 registros USDA distintos) con cantidades
de recetas típicas y factor de cocción explícito (ver `datos/recetas_mx.json` y `datos/pipeline/recetas.ts`). Nada
se escribe a mano: si cambia un ingrediente oficial, cambia el platillo. Cada registro dice en `notas`:
«valor estimado por receta estandarizada; la preparación real varía». Cuando USDA ya tiene el platillo (FNDDS:
tacos, enchiladas, tamales, pozole, mole, chilaquiles, huevos rancheros, chiles rellenos, carnitas, arroz rojo,
caldos de res/pollo, café con leche, horchata, atole, pan dulce, bolillo…) se usa el registro oficial y no se crea receta.
