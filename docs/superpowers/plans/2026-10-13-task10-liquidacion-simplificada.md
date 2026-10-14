# Task 10 — Liquidación simplificada (diseño para aprobar)

Fase de consolidación, decisión D10. **No se toca código hasta que el usuario apruebe este documento.**

## 1. Qué hay hoy y por qué pesa

`src/app/actions/liquidacion-actions.ts` (916 líneas) + UI de `/liquidaciones` (~750 líneas) manejan un
**documento congelado con ciclo de vida propio**:

```
generar → PENDIENTE (foto congelada) → [ajustar] → [regenerar si "Cambios sin reflejar"] → pagar → PAGADA
                     ↘ anular → ANULADA → reactivar (recalcula) → PENDIENTE
```

La fricción sale de que **la foto se toma antes de pagar** y luego hay que mantenerla al día con lo
vivo: "regenerar" (con conteo de generadas/actualizadas/omitidas/solapadas/ajustes descartados),
la marca "Cambios sin reflejar", conservar o descartar el ajuste al recalcular, "reactivar" una
anulada y el aviso de solape al cambiar la frecuencia.

Las órdenes **entregadas no cambian** (inmutabilidad, §5 del traspaso): lo producido en un periodo
pasado ya es fijo. Lo único que mueve el monto es el esquema del técnico. La foto previa al pago no
protege nada que la foto **en el momento del pago** no proteja.

## 2. Flujo objetivo

```
periodo (según la frecuencia del taller) → tabla en vivo por técnico → Pagar (foto + gasto) → PAGADA
                                                                        ↘ Anular → el periodo vuelve a estar por pagar
```

1. **Periodo**: igual que hoy (mensual / quincenal / semanal configurable, navegación ← →, un
   periodo de otra frecuencia sigue siendo consultable por URL).
2. **Tabla en vivo**: por técnico de la sede, órdenes, trabajos, mano de obra, esquema y **monto a
   pagar** calculado al vuelo (`computeProduccionPorMecanico` + `calcularMontoLiquidacion`, sin
   cambios). Si ya está pagado, la fila muestra **lo congelado del pago** (monto, fecha, método).
3. **Pagar** (diálogo por técnico): muestra el monto calculado; el ADMIN puede poner un **ajuste**
   opcional (± con motivo obligatorio si ≠ 0), método, referencia y fecha. En **una transacción**:
   recalcula en el servidor (nunca del formulario), crea o reutiliza el documento como `PAGADA` con la
   foto (órdenes, trabajos, mano de obra, esquema, calculado, ajuste, total) y crea el **gasto** con la
   categoría del sistema → entra al arqueo y a rentabilidad como hoy. Exige caja abierta si es en
   efectivo y el taller usa control de caja (M1, se conserva).
4. **Anular** (solo una pagada, con motivo): borra el gasto y deja el documento `ANULADA`
   (condicional al estado y al gasto leídos, B1 se conserva). El periodo vuelve a mostrarse "por pagar"
   y se paga otra vez con el mismo botón.

## 3. Qué se elimina

| Se va | Lo reemplaza |
|---|---|
| `generarLiquidacionesAction` + botón "Generar / Regenerar" y su resumen | La tabla ya es en vivo; el documento nace al pagar |
| Estado `PENDIENTE` en el flujo, "Cambios sin reflejar" (`hayCambiosSinReflejar`) | La foto se toma al pagar, no hay nada que mantener al día |
| `actualizarAjusteLiquidacionAction` + editor de ajuste en la fila | Campo de ajuste dentro del diálogo de pago |
| `reactivarLiquidacionAction` + botón "Reactivar" | Tras anular, el periodo se paga de nuevo con "Pagar" |
| Aviso al cambiar la frecuencia (`advertenciaPorLiquidacionesDelMes`) | La guarda de solape al pagar (abajo) |
| Conservar/descartar ajustes al recalcular (`ajustesDescartados`) | No hay recálculo |

## 4. Qué se conserva (requisitos de D10)

- **Frecuencia configurable** (formulario igual, sin el aviso).
- **Protección contra doble pago**, en tres capas dentro de la transacción del pago:
  1. `@@unique([periodo, usuarioId, sedeId])` (ya existe): un documento por técnico y periodo. Pagar
     hace `create`, o `updateMany` **condicional a `estado ≠ PAGADA`** si ya hay uno (anulado o un
     `PENDIENTE` heredado); dos pagos simultáneos → uno gana, el otro recibe "ya está pagada".
  2. **Solape entre frecuencias**: no se paga si el técnico ya tiene una `PAGADA` cuya ventana pisa la
     de este periodo (`ventanasSolapan`, ya probada). La fila lo muestra como "Ya pagado en otro periodo".
  3. Bloqueo `SELECT … FOR UPDATE` sobre el esquema del técnico al inicio del pago: serializa los pagos
     de un mismo técnico (cubre el caso raro de pagar a la vez una quincena y el mes que la contiene).
- **Auditoría**: `LIQUIDACION_PAGAR` (con la foto y el ajuste) y `LIQUIDACION_ANULAR` (con el gasto
  borrado); esquema y frecuencia, igual que hoy. Los valores `LIQUIDACION_GENERAR` / `_AJUSTAR` del
  enum quedan sin uso (no se borran: hay eventos viejos que los usan).
- **Entrada al arqueo**: el gasto con `pagadoEnEfectivo` como hoy.
- Esquema por técnico (tarjeta y acciones sin cambios) y el aviso de mano de obra "sin asignar".

## 5. Modelo de datos

**Sin migración.** Se reutilizan las columnas: al pagar, `generadaPorId/generadaAt` = quien paga y
cuándo (la foto se toma en ese momento). `PENDIENTE` se queda en el enum: los documentos pendientes que
existan hoy en `taller_dev` se tratan como "por pagar" (la tabla muestra lo vivo y "Pagar" los
sobrescribe). No hay usuarios reales (§0 del plan), así que no se migra nada.

## 6. B2 — periodos en UTC

`rangoDelPeriodo` corta los periodos a medianoche **UTC**: una orden entregada el último día del mes
entre las 7 p. m. y la medianoche de Bogotá cae en el periodo siguiente. Se corrige a medianoche de
Bogotá (`T00:00:00-05:00`, como `fecha-bogota.ts`), con test del borde.

## 7. Tamaño esperado y tests

- `liquidacion-actions.ts`: de 916 a **~450** líneas (quedan: esquema ×2, frecuencia ×2, listar
  periodo, pagar, anular). UI: `liquidaciones-tabla` + `liquidacion-fila` + `pagar-liquidacion-dialog`
  de ~450 a **~250**.
- Tests a reescribir: `liquidacion-actions.test.ts` (pagar crea documento + gasto; monto del servidor;
  ajuste negativo que deja total ≤ 0 → error; doble pago concurrente; solape entre frecuencias; pagar
  tras anular; anular borra el gasto; caja en efectivo), tests de la fila y del diálogo, y el borde de
  B2 en `periodo.test.ts`.
- Un commit (`fase-consol-task 10: …`), verificación completa como en las demás tasks.

## 8. Preguntas para el usuario

1. ¿Te sirve que el **ajuste** viva solo en el diálogo de pago (no se puede dejar "preparado" antes de
   pagar)?
2. ¿Corregimos **B2** aquí (recomendado: es una línea y un test) o lo dejamos para otra fase?
