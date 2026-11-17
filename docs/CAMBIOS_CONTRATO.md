# Cambios al contrato de tipos (`src/tipos.ts`)

| Fecha | Agente | Cambio | Motivo |
|---|---|---|---|
| 2026-11-16 | Agente 2 | `Alimento.soloPorciones?: boolean` (opcional) y se incluye esa misma clave opcional en el `Pick` de `RegistroComida['instantanea']` | Una receta que mezcla ingredientes en g y ml sin `pesoFinalG` no tiene peso real en gramos. `recetaComoAlimento` la representa con base `g` sobre un peso **nominal** y marca `soloPorciones: true`; `convertirABase` y `unidadesDisponibles` solo aceptan entonces las `porciones` del alimento (nunca g/kg). Debe viajar en la instantánea para que al editar un registro tampoco se ofrezcan gramos. Los alimentos existentes no cambian (campo ausente = comportamiento normal). |
| 2026-11-16 | Agente 1 | `Alimento.atipico?: boolean` (opcional) | La validación del catálogo marca (sin borrar) los registros cuya energía no cuadra con el cálculo 4/4/9 (+7 alcohol, fibra a 2 kcal) por más de max(30 %, 25 kcal). Ausente = sin observaciones. |
