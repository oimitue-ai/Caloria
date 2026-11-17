# Pipeline del catálogo nutricional (Agente 1)

Genera `public/catalogo/` a partir de los archivos oficiales. Fuentes, licencias y procedencia: [FUENTES.md](FUENTES.md).

## Un solo comando

```bash
cd datos
npm install                                    # tsx + stream-json (dependencias propias, no las del proyecto raíz)
node --max-old-space-size=5000 node_modules/.bin/tsx pipeline/construir.ts      # = npm run construir
#   --forzar       rehace todas las fuentes aunque no hayan cambiado
#   --solo=base    reconstruye solo el catálogo base (no toca marcas)
npm run probar                                 # vitest de datos/ y src/catalogo/
```

Entradas (no se versionan, ver `.gitignore`):

```
datos/crudos/usda/FoodData_Central_{foundation,sr_legacy,survey,branded}_food_json_<fecha>.zip   (JSON oficiales)
datos/crudos/off/*.tsv[.gz]                                                                      (volcado OFF filtrado)
datos/crudos/_espejos/...                                                                       (apoyo/verificación)
datos/recetas_mx.json                                                                           (recetas estandarizadas)
```

Si llega una versión nueva, basta con dejar el zip en `crudos/usda/` (se toma la fecha más reciente por patrón) y
volver a ejecutar. Medido en esta máquina (2 vCPU): construcción completa ≈ 65–75 s (Branded 3.17 GB en ~37 s).

## Etapas

1. **Importar** (`importar.ts`, en streaming): JSON de FoodData Central un objeto por línea vía `unzip -p`
   (nunca se carga entero); TSV de OFF vía gunzip. → `Alimento` normalizado por 100 g o 100 ml (Branded: base `ml`
   si `servingSizeUnit` es ml; OFF: si la cantidad del envase está en ml/l). Faltante = `undefined`, nunca 0.
   Incremental: cada fuente tiene un sello (tamaño+fecha del archivo + huella del código); si no cambió, se reutiliza.
2. **Validar** (`validar.ts`): descarta sin nombre, sin kcal, kcal fuera de 0–950, macros <0 o >100 g, P+C+G >105 g,
   sodio >40 000 mg, saturada > grasa, azúcares > carbohidratos, fibra > carbohidratos+5 (contados por motivo en el
   manifiesto). Marca `atipico: true` (sin borrar) si la energía no cuadra con 4/4/9 (+7 alcohol, fibra 2 kcal) por
   más de max(30 %, 25 kcal).
3. **Deduplicar**: Branded/OFF con el mismo GTIN-13 → se conserva el más reciente (`publicationDate`; empate: fdcId
   mayor). Entre fuentes no se fusiona nada: mismo código en USDA y OFF → `equivalentes`; genéricos con la misma
   descripción original en Foundation/SR/FNDDS → `equivalentes`.
4. **Nombres en español** (`traducir.ts` + `glosario.ts`, ~2 300 entradas, preferencias de México): reglas de orden
   (núcleo + "de" modificador + adjetivos concordados), frases compuestas, palabras con guion, marcas propias.
   `nombreTraducido: true`, `nombreOriginal` intacto. 875 nombres de SR vienen curados a mano (CC BY 4.0). Cobertura
   medida: 95–96 % de las palabras; 10 767 de 12 722 nombres USDA traducidos al 100 %.
   Sinónimos bilingües/regionales para el buscador: `src/catalogo/sinonimos.ts` (~390 grupos).
5. **Porciones** (`porciones.ts`): `foodPortions` USDA, `householdServingFullText`/`servingSize` (Branded),
   `serving_size`/`serving_quantity` (OFF) → `pieza/taza/cucharada/cucharadita/porcion` con equivalencia por unidad.
   Densidad solo de medidas líquidas explícitas de la propia fuente (onzas líquidas o ml declarados).
6. **Mexicano** (`mexicano.ts`): FNDDS/SR/Foundation por palabras clave; OFF por `countries_tags` = México;
   Branded por prefijo GS1 750 o marca mexicana conocida; recetas.
7. **Recetas** (`recetas.ts`): ver FUENTES.md.
8. **Publicar** (`publicar.ts`): formato en `docs/API_CATALOGO.md`; manifiesto con conteos reales.

Salidas intermedias (ignoradas por git): `salida/intermedio/<fuente>.ndjson`, `salida/procedencia/<fuente>.ndjson`.
