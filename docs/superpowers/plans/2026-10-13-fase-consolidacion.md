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
| B4 | 24 | Chequeo de caja fuera de la transacción | 3 (aceptado, ver D4) |
| B5 | 22 | `updateEstadoOrdenAction` no es condicional | 7 |
| B6 | 24 | TECNICO ve cuentas por pagar y ventas del día por URL | 7 |
| B7 | 21 | `borrarArchivoDeOrden` no rechaza `..` | 7 |

Fuera de alcance (anotado, no se toca): B8 (índice
de nombre de servicio), B9 (mostrador valida `stockActual` y no lo disponible), repuestos en
consignación (fase futura), y el backlog de fases anteriores (RULES.md §7).

## 1. Decisiones (aprobadas por el usuario el 2026-10-13)

| # | Decisión |
|---|---|
| D1 | **Opción del taller "Exigir acta firmada al entregar"** (`ConfiguracionTaller.exigirActaFirmada`, por defecto **no**). Con **no**: entregar es un botón con confirmación; la firma es opcional (se puede firmar en ese momento o después con `firmarActaAction`). Con **sí**: la firma es obligatoria y el formulario **dice por qué** no deja entregar sin ella. |
| D2 | **Entregar no depende de la factura**: una orden `TERMINADA` se entrega tenga o no factura (arregla A1). Lo que sigue inmutable con factura son los ítems, la mano de obra y los demás datos de trabajo. El borrador del acta también se permite con factura. Los mensajes de "no se puede" dicen el motivo real (nunca "está anulada" si no lo está). |
| D3 | **Opción del taller "Usar control de caja"** (`ConfiguracionTaller.usarControlCaja`, por defecto **no**). Con **no**: ningún movimiento exige caja abierta (la caja sigue disponible para quien quiera arquear). Con **sí**: **solo los movimientos en efectivo** exigen caja abierta de la sede; tarjeta, transferencia y otro no tocan el cajón y nunca la exigen. |
| D4 | Toda la regla de D3 vive en **un solo helper** (`exigirCajaParaEfectivo(db, sedeId, metodo, mensaje)` en `src/lib/caja/sesion.ts`, devuelve el mensaje o `null`), llamado **antes** de la transacción de cada camino de dinero. *Cambio al ejecutar la Task 3:* moverlo dentro de la transacción no cierra B4 bajo READ COMMITTED (la caja puede cerrarse en el mismo instante igual); cerrarlo exigiría bloquear la fila de la sesión en cada cobro, desproporcionado para el riesgo. **B4 queda como límite aceptado y documentado en el helper.** Caminos: cobro de factura, anticipo (registrar y devolver), gasto (crear y editar), venta y cobro de mostrador, devolución de mostrador (cuando sale efectivo), abono a proveedor y **pago de liquidación** (cierra M1). |
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

## 6. Progreso (ledger)

Estado al 2026-10-13: **Tasks 1–10 hechas**, cada una con su commit y push en `fase-consolidacion`.
Última verificación completa (tras la Task 10): `tsc` limpio, `eslint` limpio en lo tocado,
**266 archivos / 2121 tests pasando** (bajan porque se fueron los tests de generar/ajustar/reactivar). Migración `20261018120000_consolidacion` **aplicada** el 2026-10-14 a `taller_dev` y
`taller_dev_reference` (respaldo previo `~/backups/torqueflow_20261014_0002_pre_consolidacion.sql`, 444 KB, los
dos schemas); `migrate diff` vacío en ambos.

| Task | Commit | Notas |
|---|---|---|
| plan | `c0e01f2` | |
| 1 | `d912095` | `ConfiguracionTaller.exigirActaFirmada` y `usarControlCaja` (ambas `false`), formulario en `/configuracion-smtp`, `src/lib/configuracion/opciones-taller.ts`. |
| 2 | `0c704fb` | A1 cerrado. Entregar sin firma (si no se exige) audita `ORDEN_ENTREGAR` (valor nuevo del enum, en la misma migración). El tablero también ofrece entregar una orden facturada (`puedeEntregar(estado)` ya no depende de `movible`). Firmar después de entregar vuelve a funcionar en la UI (`editable` = no anulada). |
| 3 | `47be72b` | `exigirCajaParaEfectivo(db, sedeId, metodo, mensaje)` → mensaje o `null`, en todos los caminos de dinero + liquidación (M1). B3 cerrado. B4 aceptado (ver D4). Mostrador: con caja cerrada solo se bloquea el cobro en efectivo (`efectivoBloqueado`). |
| 4 | `2a54529` | M2 cerrado: precio y nombre del repuesto salen del inventario; descuento revalidado con precios reales; mostrador solo ADMIN/RECEPCION (menú, página y acciones). |
| 5 | `01dcbeb` | M3 cerrado: `SELECT … FOR UPDATE` sobre entrada y cuenta; saldo = total − Σ abonos. **Verificado contra la base real** con transacción revertida (el `$queryRaw` resuelve el schema del taller). |
| 6 | `6759bd3` | M4 cerrado: `src/lib/importacion/zip-seguro.ts` descomprime cada entrada con `maxOutputLength` (tope 40 MB, `MAX_BYTES_DESCOMPRIMIDO`); no se fía de los tamaños declarados; rechaza entradas que el directorio central no lista. Helper de zips de prueba en `src/lib/importacion/test-utils.ts`. |
| 7 | `2e30dfd` | B1, B5, B6, B7 cerrados (B7 reproducido antes de arreglar: borraba una foto del DVI). Arreglado además un test de UI intermitente de liquidaciones (findBy en vez de getBy). |
| 8 | `77ab8c9` | D8: cabecera con un contador por motivo (enlace a `/ordenes?alerta=…`, se muestran los dos aunque uno valga 0), máximo 5 filas (placa, cliente, prioridad si no es `NORMAL`, motivo, días) y pie "Mostrando 5 de N". "Ver todas" es un enlace si solo hay un motivo; con los dos ofrece un enlace por motivo (el filtro de `/ordenes` es de un solo motivo). Revisión visual con las 9 alertas reales de `taller_dev` (4 estancadas, 5 sin entregar): no se crearon datos de prueba. |
| 9 | `ef75c3f` | D9: `src/lib/exportacion/rango-fechas.ts` (Zod, días de Bogotá, `hasta` incluido, máx. 366, los dos o ninguno; por defecto del día 1 del mes a hoy) y `consultas.ts` (`ventasDelRango`, `arqueosDelRango`, fuera de `"use server"` para no exponer el rango sin validar como acción). Rango inválido → 400 sin consultar. `ventas-hoy` → `ventas` (404 el nombre viejo); la hoja de ventas gana columna Fecha; el archivo se llama `reporte-desde-a-hasta.xlsx`. `CajaCerradaFila` y su mapeo (`filaCajaCerrada`) pasaron a `src/lib/caja/resumen.ts`. `BotonExportar` abre un desplegable con dos fechas (`ExportarConRango`, formulario GET nativo) que valida con la misma regla antes de enviar. |
| 10 | `4e145b2` | D10 (diseño `fcaec93`, `2026-10-13-task10-liquidacion-simplificada.md`): tabla en vivo, el documento nace al pagar (`pagarLiquidacionAction(usuarioId, periodo, …)` con ajuste en el diálogo), anular solo pagadas y el periodo vuelve a estar por pagar. Fuera: generar/regenerar, `PENDIENTE` en el flujo, "Cambios sin reflejar", editor de ajuste, reactivar y el aviso al cambiar la frecuencia. Doble pago: `FOR UPDATE` sobre `usuarios`, `findUnique` por `periodo_usuarioId_sedeId` + `updateMany` condicional a `estado ≠ PAGADA`, `P2002` al crear, y solape entre frecuencias (solo cuentan las `PAGADA`). Verificado contra `taller_dev` con transacción revertida. B2 cerrado: `rangoDelPeriodo` corta a medianoche de Bogotá. Acción 916 → 597 líneas, UI 453 → 379 (la meta de ~450 en la acción no se alcanzó). Sin migración. |

Lecciones de esta fase (para quien siga):
- Al correr subconjuntos de tests, mirar también **"Test Files … failed"**, no solo las líneas `×`: un
  archivo de test que no compila reporta "no tests" y parece verde (pasó en la Task 7).
- Escribir tests con barras invertidas o regex desde scripts de shell las corrompe: usar el editor o
  `String.raw`.
- `migrate diff --to-schema-datamodel` toma el schema de `TENANT_DATABASE_URL`: sin esa variable compara
  contra `public` y escupe el script de creación completo (parece un desfase y no lo es). Definirla con la
  misma URL que `--from-url`.
- Los mocks de la base de varios tests de acciones declaran `configuracionTaller: { findUnique: async () => opcionesTaller }`
  con `usarControlCaja: true`; para probar la opción apagada se cambia el objeto y se restaura en `finally`.

Pendiente: verificación final (`npm run build` con `.next` borrado),
revisión del diff completo, fix round y cierre (§5).
