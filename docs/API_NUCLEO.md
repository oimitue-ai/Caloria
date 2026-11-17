# API del núcleo, la base de datos y los respaldos (Agente 2)

Importa siempre desde los índices:

```ts
import { convertirABase, calcularTotales, formatear, hoy } from '../nucleo';
import { agregarRegistro, useDia, usePerfil } from '../bd';
import { exportarRespaldoJSON, importarRespaldo } from '../respaldo';
```

Convenciones
- Fechas de día: `'YYYY-MM-DD'` en hora **local** (`hoy()`, `fechaLocal(date)`). Nunca `toISOString()` para el día.
- `creado`/`modificado`/`ultimoRespaldo`: ISO UTC (`ahoraISO()`).
- Los valores se guardan **sin redondear**; redondea solo al mostrar con `formatear` / `formatearNutriente`.
- `undefined` = dato faltante (se muestra "—"); `0` = cero real.
- Errores de datos de la BD: se lanza `ErrorDatos` (`mensaje` en español apto para mostrar, `campo` opcional).
- Los hooks devuelven `undefined` mientras cargan.

---

## 1. Núcleo (`src/nucleo`) — funciones puras

### Unidades
| Función | Descripción |
|---|---|
| `convertirABase(alimento, cantidad, unidad, porcionEtiqueta?) → {ok:true, cantidadBase, porcion?} \| {ok:false, motivo}` | Convierte a g/ml de la base del alimento. Acepta `Alimento` o instantánea. Orden: porción del alimento (por etiqueta, o la de esa unidad: pieza/taza/cucharada/…); conversión dimensional (g, kg / ml, l, taza=240, cucharada=15, cucharadita=5); ml↔g **solo con `densidad`**. `soloPorciones` → solo porciones. |
| `unidadesDisponibles(alimento) → OpcionUnidad[]` | Opciones válidas para el selector: `{unidad, etiqueta, porcionEtiqueta?, equivalencia, predeterminada?}`. Cada porción es una opción distinta. Toda opción es convertible. |
| `unidadPredeterminada(alimento) → OpcionUnidad \| undefined` | La opción sugerida al abrir el formulario. |
| `describirCantidad(cantidad, unidad, porcionEtiqueta?) → string` | `"150 g"`, `"2 tazas"`, `"2 × 1 pieza mediana (118 g)"`. |
| `NOMBRE_UNIDAD`, `FACTOR_UNIDAD` | Nombres (singular/plural/abreviatura) y factores. |

```ts
const op = unidadesDisponibles(platano);            // [{unidad:'pieza', porcionEtiqueta:'1 pieza mediana (118 g)', …}, {unidad:'g'…}]
const r = convertirABase(platano, 2, op[0].unidad, op[0].porcionEtiqueta); // {ok:true, cantidadBase:236}
if (!r.ok) mostrarError(r.motivo);
```

### Cálculo
| Función | Descripción |
|---|---|
| `calcularTotales(nutrientesPor100, cantidadBase) → Totales & {faltantes}` | `faltantes`: macros principales ausentes en la fuente (cuentan 0). Opcionales ausentes quedan `undefined`. |
| `sumarTotales(lista) → Totales`, `escalarTotales(t, factor)`, `promediarTotales(lista) → Totales \| null`, `totalesCero()`, `soloTotales(t)` | Aritmética de totales. |
| `kcalDesdeMacros({proteina, carbohidratos, grasa}) → number` | 4/4/9. |
| `validarEnergia(nutrientes, tolerancia=0.2) → {coherente, kcalDeclaradas, kcalEstimadas, diferenciaRelativa}` | Detecta kcal incoherentes con los macros (para avisar al capturar alimentos propios). |
| `formatear(valor, decimales=0) → string` | Formato es-MX; `undefined` → `"—"`. |
| `formatearNutriente(clave, valor) → string` | `"134 kcal"`, `"12.5 g"`, `"320 mg"`. |
| `nutrientesFaltantes(n)`, `redondear(n, d)`, `limpiar(n)`, `NOMBRE_NUTRIENTE`, `CLAVES_PRINCIPALES`, `CLAVES_OPCIONALES` | Auxiliares. |

```ts
calcularTotales({ kcal: 89, proteina: 1.09, carbohidratos: 22.84, grasa: 0.33 }, 150).kcal // 133.5
formatearNutriente('kcal', 133.5) // "134 kcal"
```

### Instantánea
`instantaneaDe(alimento) → Instantanea` copia profunda de lo que un registro guarda (`nombre, marca, fuente, base, nutrientes, densidad, porciones, soloPorciones`).

### Recetas
| Función | Descripción |
|---|---|
| `crearIngrediente(alimento, cantidad, unidad, porcionEtiqueta?) → {ok:true, ingrediente} \| {ok:false, motivo}` | Arma un `IngredienteReceta` (con instantánea y cantidadBase). |
| `totalesReceta(receta) → Totales & {incompletos}` | Totales de toda la receta; `incompletos` lista ingredientes con macros faltantes. |
| `totalesPorPorcion(receta) → Totales` | Totales de 1 porción. |
| `pesoReceta(receta) → {pesoG, origen: 'peso_final'\|'suma_gramos'\|'nominal', registrablePorGramos}` | Peso usado para "por 100 g". |
| `recetaComoAlimento(receta) → Alimento` | Alimento registrable (`id: 'receta:<id>'`, base g, porción `{unidad:'porcion', etiqueta:'1 porción'}` predeterminada). Si mezcla g y ml sin densidad ni `pesoFinalG`, lleva `soloPorciones: true`. |

```ts
const ing = [crearIngrediente(platano, 1, 'pieza'), crearIngrediente(leche, 1, 'taza'), crearIngrediente(avena, 30, 'g')];
// …si todos ok:
const receta = await crearReceta({ nombre: 'Licuado', porciones: 2, ingredientes: ing.map(i => i.ingrediente) });
totalesPorPorcion(receta).kcal // 186.46
```

### Metas (orientativas)
| Función / constante | Descripción |
|---|---|
| `tmbMifflinStJeor({sexo, pesoKg, estaturaCm, edad}) → number` | Hombre 30 a, 80 kg, 175 cm → 1748.75. |
| `gastoEnergeticoTotal(tmb, actividad)` | × 1.2 / 1.375 / 1.55 / 1.725 / 1.9 (`FACTORES_ACTIVIDAD`, `NIVELES_ACTIVIDAD` con nombres y descripciones). |
| `proponerMetas(perfil, opciones?) → PropuestaMetas \| {ok:false, faltantes, mensaje}` | `{ok:true, tmb, get, ritmoKgSemana, ajusteDiarioKcal, pisoAplicado, metas:{kcal, proteina, carbohidratos, grasa}, avisos}`. 7700 kcal/kg; ritmo por defecto 0.5 (perder) / 0.25 (ganar); máximo 1 / 0.5; piso 1200 mujer / 1500 hombre con aviso. `avisos` termina siempre con `AVISO_ORIENTATIVO`. |
| `repartirMacros(kcal, pesoKg, {proteinaGKg?, grasaFraccion?})` | Proteína 1.6–2.0 g/kg (1.8), grasa 25–30 % (27.5 %), resto carbohidratos. |
| `metaVigenteEn(historial, fecha) → Metas \| null` | Meta con `desde` más reciente ≤ fecha. |
| `revisarMetas(metas, sexo?) → string[]` | Avisos no bloqueantes para metas editadas a mano. |
| `AVISO_ORIENTATIVO`, `AVISO_CONSULTA` | Textos obligatorios a mostrar junto a la propuesta. |

```ts
const p = proponerMetas(perfil);
if (p.ok) await guardarMetas({ ...p.metas });        // desde = hoy
```

### Peso
| Función | Descripción |
|---|---|
| `promediosSemanales(pesos) → {inicio, fin, promedioKg, minimoKg, maximoKg, registros}[]` | Semanas lunes–domingo con datos. |
| `promediosMensuales(pesos) → (… & {mes})[]` | Meses con datos. |
| `serieTendencia(pesos, {ventanaDias=7, alfa=0.1}) → {fecha, pesoKg, mediaMovilKg, tendenciaKg}[]` | Media móvil de 7 días (por fecha) y tendencia suavizada exponencial que respeta huecos. Ideal para la gráfica. |
| `ritmoKgSemana(pesos, {ventanaRitmoDias=28, minimoDias=7}) → number \| null` | Regresión lineal sobre la tendencia; negativo = bajando. |
| `resumenPeso(pesos, perfil, opciones?) → ResumenPeso` | `actual, inicialKg, variacionKg, objetivoKg, distanciaObjetivoKg, objetivoAlcanzado, progreso (0–1), tendenciaKg, ritmoKgSemana, semanasEstimadas, fechaEstimada, avisos`. |
| `variacionPeso`, `distanciaObjetivo`, `normalizarPesos`, `regresionLineal`, `imc(pesoKg, estaturaCm)` | Auxiliares. |

### Estadísticas
| Función | Descripción |
|---|---|
| `estadisticasRango(registros, historialMetas, desde, hasta, {tolerancia=0.1, nutrientes=['kcal'], hoy?}) → EstadisticasRango` | `diasPeriodo, diasRegistrados, promedio (sobre días registrados; null si ninguno), total, diasConMeta, diasCumplidos, cumplimiento (0–1 \| null), metaKcalPromedio, serie, semanas, meses, promedioPorComida, rachaActual, rachaMaxima`. Con `hoy`, los días futuros no cuentan. |
| `serieDiaria(…) → DiaEstadistica[]` | Un elemento por día: `{fecha, registrado, registros, totales (null = sin registros), meta, cumple (null = no evaluable), proporcionMeta}`. |
| `evaluarDia(totales, meta, opciones) → boolean \| null`, `dentroDeMeta(valor, meta, tol)` | Cumplimiento ±10 % con la meta vigente ese día. |
| `resumirDia(fecha, registros, meta) → ResumenDia` | `{porComida: {desayuno: {registros, totales}, …}, totales, meta, restante, registrado}` (lo que devuelve `useDia`). |
| `totalesPorDia(registros)` | `Map<fecha, {totales, n}>`. |

### Fechas
`hoy()`, `fechaLocal(date)`, `fechaEnZona(date, zona)`, `ahoraISO()`, `esFechaValida(s)`, `sumarDias(f, n)`, `diasEntre(a, b)`, `rangoFechas(a, b)`, `diaSemana(f)` (lunes=0), `inicioSemana(f)`, `finSemana(f)`, `inicioMes(f)`, `finMes(f)`, `claveMes(f)` (`'YYYY-MM'`), `sumarMeses(f, n)`, `semanasEnRango(a, b)`, `mesesEnRango(a, b)`, `nombreDia(f)`, `nombreMes(f)`, `formatearFechaLarga(f)` ("lunes 16 de noviembre de 2026"), `formatearFechaCorta(f, conAnio?)` ("16 nov"), `aDate(f)`, `diasDelMes(a, m)`.

---

## 2. Base de datos (`src/bd`)

Tablas (Dexie, BD `caloria`, `VERSION_ESQUEMA`): `perfil` (fila única), `config` (fila única), `metas` (clave `desde`), `registros` (índices `fecha`, `[fecha+comida]`, `alimentoId`), `alimentosUsuario`, `recetas`, `pesos` (`fecha` única), `usos` (recientes/frecuentes por `[alimentoId+comida]` con última cantidad/unidad), `favoritos`, `cacheAlimentos` (alimentos de catálogo usados, para uso sin conexión).

### Registros de comida
| Función | Descripción |
|---|---|
| `agregarRegistro({fecha, comida, alimento, cantidad, unidad, porcionEtiqueta?}) → Promise<RegistroComida>` | `alimento`: `Alimento` (catálogo, propio o `recetaComoAlimento`) o `{...instantanea, id}`. Calcula cantidadBase y totales, guarda instantánea, actualiza recientes/frecuentes y la caché offline. Lanza `ErrorDatos` si la unidad no es convertible. |
| `agregarRegistros(lista)` | Varios a la vez (todo o nada). |
| `prepararRegistro(datos) → RegistroComida` | Igual pero sin guardar (vista previa de totales). |
| `editarRegistro(id, {cantidad?, unidad?, porcionEtiqueta?: string\|null, fecha?, comida?})` | Recalcula con la **instantánea** guardada. Si cambia la unidad sin indicar porción, la porción se quita. |
| `eliminarRegistro(id) → RegistroComida \| undefined` / `restaurarRegistro(registro)` | Para "Deshacer". |
| `vaciarComida(fecha, comida) → RegistroComida[]` | |
| `copiarComida(fechaOrigen, comidaOrigen, fechaDestino, comidaDestino?)`, `copiarDia(fechaOrigen, fechaDestino)` | Copias con id nuevo; conservan instantánea y totales. |
| `repetirUso(uso, fecha, comida, cambios?)` | Registrar en un toque desde recientes/frecuentes/favoritos (`Favorito` necesita `cantidad`/`unidad`: usa `unidadPredeterminada(fav.instantanea)`). Usa la versión actual del alimento si está local. |
| `obtenerRegistro(id)`, `registrosDelDia(fecha)`, `registrosDeComida(fecha, comida)`, `registrosEnRango(desde, hasta)`, `registrosDeAlimento(id)` | Consultas. |
| `diasConRegistro('YYYY-MM') → string[]`, `resumenDelDia(fecha) → ResumenDia`, `estadisticasDeRango(desde, hasta, opciones)` | |

```ts
await agregarRegistro({ fecha: hoy(), comida: 'desayuno', alimento, cantidad: 2, unidad: 'pieza', porcionEtiqueta: '1 pieza mediana (118 g)' });
const borrado = await eliminarRegistro(id); /* deshacer: */ if (borrado) await restaurarRegistro(borrado);
```

### Alimentos propios, búsqueda local, favoritos, recientes
| Función | Descripción |
|---|---|
| `crearAlimentoUsuario({nombre, base, nutrientes, porciones?, densidad?, marca?, categoria?, codigoBarras?, sinonimos?, notas?}) → Alimento` | id `usuario:<uuid>`. Nutrientes por 100 g/ml. |
| `editarAlimentoUsuario(id, cambios)`, `eliminarAlimentoUsuario(id)`, `obtenerAlimentoUsuario(id)`, `listarAlimentosUsuario()` | Editar/borrar **no** altera registros ni recetas existentes. |
| `obtenerAlimentoLocal(id) → Alimento \| undefined` | Busca en propios (`usuario:`), recetas (`receta:`) y caché de catálogo. Si no está, consulta el catálogo. |
| `buscarAlimentosLocales(texto, {limite?, incluirCache?}) → Alimento[]` | Propios + recetas + caché, sin acentos, sin conexión. Combínalo con el buscador del catálogo. |
| `buscarCodigoBarrasLocal(codigo)` | En propios y caché. |
| `guardarEnCache(alimento)`, `podarCache(maximo=3000)` | Caché offline (se llena sola al registrar). |
| `listarFavoritos()`, `esFavorito(id)`, `agregarFavorito(alimento)`, `quitarFavorito(id)`, `alternarFavorito(alimento) → boolean` | |
| `listarRecientes(comida?, limite=20)`, `listarFrecuentes(comida?, limite=20) → UsoAlimento[]` | `UsoAlimento = {alimentoId, comida, nombre, marca?, instantanea, cantidad, unidad, porcionEtiqueta?, usos, ultimoUso}`. |
| `olvidarUso(alimentoId, comida?)` | Quitar de recientes. |
| `normalizarTexto(t)` | Minúsculas sin acentos. |

### Recetas
`crearReceta({nombre, ingredientes, porciones, pesoFinalG?, notas?})`, `editarReceta(id, cambios)`, `eliminarReceta(id)`, `obtenerReceta(id)`, `listarRecetas()`, `duplicarReceta(id, nombre?)`, `recetaRegistrable(id) → Alimento` (equivale a `recetaComoAlimento`). Editar una receta no altera registros previos.

### Peso
`registrarPeso({pesoKg, fecha?=hoy, nota?})` (si ya hay peso ese día, lo reemplaza), `editarPeso(id, {pesoKg?, fecha?, nota?: string \| null})`, `eliminarPeso(id)`, `listarPesos(desde?, hasta?)`, `pesoDeFecha(fecha)`, `sincronizarPerfilConPesos()`. Mantienen `perfil.pesoActualKg` (último registro) y `pesoInicialKg` (primero, si no estaba capturado).

### Perfil, metas y configuración
| Función | Descripción |
|---|---|
| `obtenerPerfil() → Perfil` (`{}` si no hay), `guardarPerfil(cambios) → Perfil` | Mezcla; `undefined` borra el campo. Validado (edad 1–120, estatura 50–250, peso 20–400). |
| `guardarMetas({kcal, proteina, carbohidratos, grasa, personalizada?, desde?=hoy}) → Metas` | Agrega al historial (reemplaza si ya hay una con ese `desde`). |
| `metasVigentes(fecha=hoy) → Metas \| null`, `historialMetas() → Metas[]`, `eliminarMetas(desde)` | |
| `obtenerConfig()`, `guardarConfig(cambios)`, `marcarRespaldo(iso?)`, `respaldoPendiente(config, ahora?) → boolean`, `CONFIG_PREDETERMINADA` (`tema:'sistema'`, `recordarRespaldoDias: 7`) | |

### Almacenamiento
`solicitarPersistencia() → Promise<boolean \| null>` (llámalo tras el primer registro o en Ajustes), `estadoAlmacenamiento() → {soportado, persistente, usoBytes, cuotaBytes, proporcionUsada}`, `formatearBytes(n)`.

### Conexión
`bd()` instancia Dexie compartida; `usarBaseDeDatos(nombre)` (pruebas), `cerrarBD()`, `borrarBaseDeDatos()`, `nuevoId()`, `VERSION_ESQUEMA`, `TABLAS`.

### Hooks (`useLiveQuery`; `undefined` mientras carga)
| Hook | Devuelve |
|---|---|
| `useDia(fecha)` | `ResumenDia` (registros por comida, totales, meta, restante) |
| `useRango(desde, hasta)` | `RegistroComida[]` |
| `useEstadisticas(desde, hasta, opciones?)` | `EstadisticasRango` |
| `usePesos(desde?, hasta?)` | `RegistroPeso[]` |
| `useResumenPeso(opciones?)` | `ResumenPeso` |
| `useMetas()` / `useMetaVigente(fecha)` | `Metas[]` / `Metas \| null` |
| `usePerfil()` | `Perfil` |
| `useRecientes(comida?, limite?)` / `useFrecuentes(comida?, limite?)` | `UsoAlimento[]` |
| `useFavoritos()` | `Favorito[]` |
| `useRecetas()` | `Receta[]` |
| `useAlimentosUsuario()` | `Alimento[]` |
| `useConfig()` | `Configuracion` |
| `useDiasConRegistro('YYYY-MM')` | `Set<string>` |
| `useEstadoAlmacenamiento()` | `{estado, actualizar}` |

```tsx
const dia = useDia(fecha);
if (!dia) return <Cargando />;
dia.porComida.desayuno.registros.map(r => …); dia.totales.kcal; dia.restante?.kcal;
```

---

## 3. Respaldos y exportación (`src/respaldo`)

| Función | Descripción |
|---|---|
| `exportarRespaldoJSON({marcarFecha?=true, comprimir?=false}) → Promise<{blob, bytes, nombreArchivo, respaldo}>` | Respaldo completo listo para descargar (`caloria-respaldo-AAAA-MM-DD.json`, o `.json.gz` con `comprimir`). Anota `config.ultimoRespaldo`. |
| `crearRespaldo() → Promise<Respaldo>` | `{formato:'caloria-respaldo', version, app, creado, conteos, suma:{algoritmo:'SHA-256', valor}, datos}`; `datos` = todas las tablas. La suma es sobre el JSON canónico de `datos`. |
| `leerRespaldo(texto \| Blob \| File \| Uint8Array \| ArrayBuffer) → Promise<{ok:true, respaldo, conteos} \| {ok:false, error}>` | Acepta JSON o .json.gz. Comprueba formato, versión (rechaza versiones más nuevas, migra las antiguas), suma de verificación y valida cada registro con zod. **No toca la BD.** Muestra `conteos` al usuario antes de importar. |
| `importarRespaldo(respaldo, 'reemplazar' \| 'combinar') → Promise<{modo, agregados, omitidos}>` | Reemplazar: borra todo y deja exactamente el respaldo. Combinar: agrega solo lo que no existe (por id; pesos también por fecha; metas por `desde`); conserva perfil/config actuales completando campos vacíos. Una sola transacción (todo o nada). |
| `exportarComidasCSV(desde?, hasta?)`, `exportarPesoCSV() → Promise<{blob, texto, nombreArchivo}>` | CSV UTF-8 con BOM, coma, CRLF, comillas RFC 4180; textos que empiezan con `= + - @` llevan `'` delante (anti-fórmulas). Valores a 2 decimales. |
| `comidasACSV(registros)`, `pesosACSV(pesos)`, `escaparCSV(v)`, `aCSV(encabezados, filas)`, `leerCSV(texto)` | Versiones puras. |
| `exportarExcel({desde?, hasta?}) → Promise<{datos: Uint8Array, blob, nombreArchivo}>` | .xlsx (exceljs, cargado bajo demanda) con hojas `HOJAS_EXCEL`: Comidas, Resumen diario (días con registro, meta, % y cumplimiento), Peso (con media móvil y tendencia), Recetas (ingredientes + total + por porción), Alimentos propios. |
| `descargar(blob, nombreArchivo)`, `compartirODescargar(blob, nombreArchivo) → 'compartido' \| 'descargado'` | Ayudas de navegador (hoja de compartir del sistema en Android si está disponible). |
| `leerDatos()`, `validarDatos(datos)`, `calcularSuma(datos)`, `jsonCanonico(v)`, `construirLibro(datos)` | Auxiliares / pruebas. |

```ts
const { blob, nombreArchivo } = await exportarRespaldoJSON();
await compartirODescargar(blob, nombreArchivo);

const r = await leerRespaldo(archivo);            // File de un <input type="file">
if (!r.ok) mostrarError(r.error);
else if (confirm(`Importar ${r.conteos.registros} registros…`)) await importarRespaldo(r.respaldo, 'combinar');

const csv = await exportarComidasCSV('2026-11-01', '2026-11-30'); descargar(csv.blob, csv.nombreArchivo);
const xlsx = await exportarExcel(); descargar(xlsx.blob, xlsx.nombreArchivo);
```

---

## 4. Notas para otros módulos

- `agregarRegistro` guarda en `porcionEtiqueta` la porción realmente usada aunque no se haya indicado (p. ej. "2 piezas" → `'1 pieza mediana (118 g)'`), para que el historial y "recientes" la muestren.
- `ahoraISO()` es estrictamente creciente dentro de la sesión: el orden por `creado` es el orden de captura.
- Registrar un **favorito**: abre el panel de cantidad con `obtenerAlimentoLocal(fav.alimentoId) ?? { ...fav.instantanea, id: fav.alimentoId }` como alimento.
- Pruebas: `npm test` usa `vitest.config.ts` con dos proyectos: **nucleo** (Node: `src/nucleo`, `src/bd`, `src/respaldo`, `datos/**/*.test.ts`) e **interfaz** (jsdom: el resto de `src/**` y `pruebas/**`, excepto `pruebas/e2e/**`). Un archivo puede forzar entorno con `// @vitest-environment jsdom`. Para usar IndexedDB en pruebas: `import 'fake-indexeddb/auto'` y `usarBaseDeDatos('nombre-unico')` en `beforeEach`, `borrarBaseDeDatos()` en `afterEach`.
