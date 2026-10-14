# Fase de consolidación — arreglos de la revisión de las fases 18–24 y simplificación

> Rama: `fase-consolidacion` (desde `main` en `3a3fd28`). Commits: `fase-consol-task N: …` y
> `fase-consol-fix: …`. Un commit + push por tarea (RULES.md §3).

## 0. Contexto y por qué existe esta fase

Las fases 18–22 y 24 se hicieron con otro agente. La revisión del 2026-10-13 encontró **1 hallazgo
alto, 4 medios y varios bajos**, y además la conversación con el usuario dejó claro que algunas
piezas meten **fricción** innecesaria (caja abierta obligatoria para todo, firma obligatoria al
entregar). La aplicación **todavía no tiene usuarios reales**: se puede cambiar comportamiento sin
migrar datos de nadie.

Hallazgos de la revisión que esta fase cierra (referencia para los tests):

| Id | Fase | Hallazgo | Tarea |
|---|---|---|---|
| A1 | 21 | Una orden facturada en `TERMINADA` no se puede entregar (`entregarOrdenAction` usa `esOrdenMutable`; `updateEstadoOrdenAction` rechaza `ENTREGADA`) | 2 |
| M1 | 19 | Pagar una liquidación en efectivo no exige caja abierta | 3 |
| M2 | 24 | Mostrador: precio y descripción vienen del navegador; el técnico vende y cobra | 4 |
| M3 | 24 | `sincronizarCuentaPorPagar` sin bloqueo: dos ítems simultáneos inflan el saldo | 5 |
| M4 | 20 | Importación: sin tope del tamaño **descomprimido** del `.xlsx` (bomba zip) | 6 |
| B1 | 19 | Anular vs pagar liquidación: gasto huérfano | 7 |
| B3 | 24 | Marcar como "efectivo" un gasto viejo no lo mete al arqueo | 3 |
| B4 | 24 | Chequeo de caja fuera de la transacción | 3 |
| B5 | 22 | `updateEstadoOrdenAction` no es condicional | 7 |
| B6 | 24 | TECNICO ve cuentas por pagar y ventas del día por URL | 7 |
| B7 | 21 | `borrarArchivoDeOrden` no rechaza `..` | 7 |

Fuera de alcance (anotado, no se toca): B2 (periodos en UTC, se revisa en la Task 10), B8 (índice
de nombre de servicio), B9 (mostrador valida `stockActual` y no lo disponible), repuestos en
consignación (fase futura), y el backlog de fases anteriores (RULES.md §7).

## 1. Decisiones (aprobadas por el usuario el 2026-10-13)

| # | Decisión |
|---|---|
| D1 | **Opción del taller "Exigir acta firmada al entregar"** (`ConfiguracionTaller.exigirActaFirmada`, por defecto **no**). Con **no**: entregar es un botón con confirmación; la firma es opcional (se puede firmar en ese momento o después con `firmarActaAction`). Con **sí**: la firma es obligatoria y el formulario **dice por qué** no deja entregar sin ella. |
| D2 | **Entregar no depende de la factura**: una orden `TERMINADA` se entrega tenga o no factura (arregla A1). Lo que sigue inmutable con factura son los ítems, la mano de obra y los demás datos de trabajo. El borrador del acta también se permite con factura. Los mensajes de "no se puede" dicen el motivo real (nunca "está anulada" si no lo está). |
| D3 | **Opción del taller "Usar control de caja"** (`ConfiguracionTaller.usarControlCaja`, por defecto **no**). Con **no**: ningún movimiento exige caja abierta (la caja sigue disponible para quien quiera arquear). Con **sí**: **solo los movimientos en efectivo** exigen caja abierta de la sede; tarjeta, transferencia y otro no tocan el cajón y nunca la exigen. |
| D4 | Toda la regla de D3 vive en **un solo helper** (`exigirCajaParaEfectivo(tx, sedeId, metodo)`) llamado **dentro de la transacción** de cada camino de dinero (cierra B4 hasta donde permite READ COMMITTED). Caminos: cobro de factura, anticipo (registrar y devolver), gasto (crear y editar), venta y cobro de mostrador, devolución de mostrador (cuando sale efectivo), abono a proveedor y **pago de liquidación** (cierra M1). |
| D5 | **Editar un gasto no lo convierte en efectivo** si el control de caja está activo (B3): el arqueo cuenta por `createdAt`, así que pasar a efectivo un gasto viejo nunca entraría al arqueo. Se pide registrar un gasto nuevo. |
| D6 | **Mostrador solo para ADMIN y RECEPCION** (vender es cobrar). Las líneas con repuesto toman **precio y descripción del servidor** (`Repuesto.precioVenta`, `Repuesto.nombre`); las líneas libres (sin repuesto) conservan su precio y descripción. Cierra M2. |
| D7 | **La prioridad se queda** como está: `NORMAL` por defecto, no se elige al crear; se cambia desde la ficha o el tablero (como la bandera de un correo). |
| D8 | **Tarjeta "Alertas del taller" rediseñada**: resumen por motivo (estancadas / sin entregar) con contador, máximo **5** filas visibles, y botón **"Ver todas"** que lleva a `/ordenes?alerta=…`. |
| D9 | **Exportación con rango de fechas** para *ventas* y *arqueos* (`?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`, validado en el servidor, máximo 366 días, por defecto el mes en curso). Cartera y cuentas por pagar son fotos del momento: sin rango. La sede sigue saliendo de la sesión. |
| D10 | **Liquidación simplificada al final** (Task 10): se diseña aparte antes de tocar código, conservando la frecuencia configurable. |

## 2. Modelo de datos (Task 1)

Una sola migración `AAAAMMDDHHMMSS_consolidacion` sobre `configuracion_taller`:

```prisma
model ConfiguracionTaller {
  // …campos existentes…
  /// Fase de consolidación (D1): si es false, entregar no exige firma.
  exigirActaFirmada Boolean @default(false) @map("exigir_acta_firmada")
  /// Fase de consolidación (D3): si es false, ningún movimiento exige caja abierta.
  usarControlCaja   Boolean @default(false) @map("usar_control_caja")
}
```

La migración se aplica a `taller_dev` y `taller_dev_reference` **solo con aprobación y respaldo**
(§5). Hasta entonces los tests usan la base simulada.

## 3. Tareas

### Task 1 — Configuración del taller: las dos opciones
- Schema + migración (§2) + `prisma generate` (los dos clientes).
- `src/lib/configuracion/opciones-taller.ts`: `leerOpcionesTaller(db)` → `{ exigirActaFirmada, usarControlCaja }` con valores por defecto si no hay fila (mismo patrón que `leerDiasEstancada`).
- Acción `guardarOpcionesTallerAction` (solo ADMIN) y formulario con dos interruptores en la página de configuración (`src/app/(dashboard)/configuracion-smtp/page.tsx`), cada uno con una línea que explica qué cambia.
- Tests: lectura con y sin fila, acción (rol, valores), formulario.

### Task 2 — Entrega (A1, D1, D2)
- `entregarOrdenAction`: exige `estado === "TERMINADA"` (transición válida) y **no** mira la factura. Si `exigirActaFirmada` y no llega firma → error explicativo. Si no se exige y no llega firma → entrega con el acta sin `firmadaAt` (se puede firmar después).
- `guardarActaAction`: permitida en `TERMINADA` aunque haya factura.
- `acta-entrega-form.tsx` y `ordenes/[id]/page.tsx`: el formulario se muestra para `TERMINADA` con o sin factura; botón **"Entregar"** con confirmación ("¿Entregar sin firma?" cuando no hay firma y no se exige); si se exige, el botón explica qué falta. Mensaje de solo lectura con el motivo real.
- Tests: entregar con factura (antes fallaba), con/sin firma según la opción, mensaje correcto para facturada vs anulada, carrera de entrega (se conserva).

### Task 3 — Caja (D3, D4, D5; M1, B3, B4)
- `src/lib/caja/sesion.ts`: `exigirCajaParaEfectivo(tx, sedeId, metodo)` → lanza un error centinela con mensaje claro si la opción está activa, el método es `EFECTIVO` y no hay sesión abierta.
- Reemplazar los chequeos actuales (fuera de transacción) por el helper dentro de la transacción en: `pago-actions.ts`, `anticipo-actions.ts` (x2), `gasto-actions.ts` (x2), `venta-mostrador-actions.ts` (venta y cobro), `devolucion-mostrador-actions.ts` (solo si `montoEnEfectivo > 0` y el método es efectivo), `cuenta-por-pagar-actions.ts`, y **añadirlo** en `pagarLiquidacionAction`.
- `actualizarGastoAction`: si el control está activo y el gasto pasa de no-efectivo a efectivo → error (D5).
- Pantalla `/mostrador` y `/caja`: el aviso "abre la caja" solo aparece si la opción está activa.
- Tests: por cada camino, opción apagada (pasa sin caja), opción encendida + tarjeta (pasa sin caja), opción encendida + efectivo sin caja (falla); liquidación en efectivo (M1); gasto editado a efectivo (B3).

### Task 4 — Mostrador (D6, M2)
- Roles de venta = `["ADMIN", "RECEPCION"]`; la página y el menú lo respetan.
- `crearVentaMostradorAction`: leer `precioVenta` y `nombre` de los repuestos (ya se consultan para validar la sede) y construir las líneas con esos valores; los totales se calculan después con los precios del servidor. El carrito muestra el precio del repuesto como no editable.
- Tests: precio manipulado en el JSON se ignora, descripción manipulada se ignora, TECNICO rechazado, línea libre conserva lo enviado.

### Task 5 — Cuentas por pagar (M3)
- `sincronizarCuentaPorPagar`: bloquear la fila de la entrada al empezar (`SELECT … FOR UPDATE` con `$queryRaw` dentro de la transacción) y recalcular el saldo como `total − Σ abonos` con la fila bloqueada (sin deltas).
- Verificar que `$queryRaw` respeta el schema del taller (el cliente fija el `search_path` por la URL); si no, usar el nombre calificado.
- Tests: el saldo sale de total − abonos; se llama al bloqueo antes de leer; dos sincronizaciones seguidas dejan el mismo resultado (idempotente).

### Task 6 — Importación (M4)
- `src/lib/importacion/xlsx.ts`: antes de leer, inspeccionar el zip (`fflate`, ya es dependencia transitiva; si no se puede importar directo, añadirla explícita) y rechazar si la suma descomprimida supera **40 MB** o alguna entrada declara tamaño desconocido mayor que el tope.
- Mensaje en español en `importarAction`.
- Tests: un zip pequeño que declara un tamaño descomprimido enorme se rechaza sin descomprimir; la plantilla oficial pasa.

### Task 7 — Menores (B1, B5, B6, B7)
- B1 `anularLiquidacionAction`: `updateMany where { id, estado: <leído>, gastoId: <leído> }`.
- B5 `updateEstadoOrdenAction`: `updateMany where { id, estado: orden.estado }`; si `count === 0` → "Otra persona ya cambió el estado".
- B6 `getCuentasPorPagar` → `requireRole(["ADMIN","RECEPCION"])`; `getMostradorDatos` → mismos roles que D6.
- B7 `borrarArchivoDeOrden`: rechazar cualquier segmento `..`, `.` o con separadores.
- Tests de cada uno.

### Task 8 — Tarjeta "Alertas del taller" (D8)
- Cabecera con dos contadores (estancadas / sin entregar), cada uno enlazado a `/ordenes?alerta=…`.
- Máximo 5 filas, ordenadas como hoy (prioridad y días); fila compacta: placa, cliente, días y motivo; prioridad solo si no es `NORMAL`.
- Botón **"Ver todas"** cuando hay más de 5.
- Tests del componente (0, ≤5, >5 alertas). Revisión visual con la app corriendo y, si hace falta, datos de prueba creados por el agente y borrados al terminar.

### Task 9 — Exportación con rango de fechas (D9)
- Ruta `/api/exportar/[reporte]`: `desde`/`hasta` opcionales para `ventas` y `arqueos`, validados con Zod (formato, `desde ≤ hasta`, máximo 366 días); por defecto el mes en curso (Bogotá).
- Las consultas de ventas y arqueos aceptan el rango (la de ventas deja de depender de `getMostradorDatos`).
- `BotonExportar`: para esos dos reportes, un pequeño formulario con dos fechas antes de descargar. El reporte "ventas-hoy" pasa a llamarse "ventas".
- Tests: rango inválido → 400, rango largo → 400, sede de la sesión.

### Task 10 — Liquidación simplificada (D10) — se diseña antes de ejecutar
- Antes de codificar: documento corto con el flujo objetivo (periodo según la frecuencia del taller → montos por técnico → pagar (gasto) → anular) y qué se elimina (recalcular congelado, reactivar, avisos de solape por cambio de frecuencia…). **Aprobación del usuario antes de tocar código.**
- Objetivo: reducir `liquidacion-actions.ts` y la UI a la mitad aproximadamente, sin perder: frecuencia configurable, protección contra doble pago, auditoría y entrada al arqueo.

## 4. Verificación por tarea y final

Por tarea: `npx tsc --noEmit --incremental false`, `npx eslint` en lo tocado y `npm test` (resumen en el
reporte). Al final: lo mismo + `npm run build` (borrar `.next` antes) + revisión del diff completo +
fix round.

## 5. Cierre (solo con aprobación del usuario)

Respaldo `pg_dump`, migración a `taller_dev` y `taller_dev_reference`, `migrate diff` vacío,
`git merge --no-ff` a `main`, actualizar `PROJECT_BRIEF.md` y `docs/TRASPASO-AGENTES.md` (las
invariantes de caja cambian: §5 del traspaso), push.
