# Pendientes del Plan 2c

Copia del registro de ejecución del Plan 2c (2026-11-21).

| T19/T21 db tests | descritos por caso (no código completo) | Ruling: aceptable — deben reutilizar helpers reales de servicio-db.test.ts; costo si es incorrecto: implementador escribe más código propio |
Task 19: minor (deferred): falta prueba POR_CONFIRMAR + otro día + confirmación vacía; línea en blanco en el test
Task 19: complete (commits 6d2b33f..91749b6, review clean)
Task 20: minor (deferred, triage final): pasar a producción con activa=false y activar después no re-fecha activadaDesde (facturas de pruebas cuentan como pendientes)
Task 20: minor (deferred): tests sin caso NC con documentos previos ni where del count; aggregate mock no diferencia tipo
Task 20: complete (commits 91749b6..32b27f5, review clean)
Task 21: minor (deferred): concepto/motivo nuevos ignorados al reintentar una NC existente; mensaje "solo aceptada" para factura ya ANULADO; texto "esta factura" en histórico para NC; condición redundante tipo
Task 21: minor (deferred): dos llamadas concurrentes podrían correr la recuperación a la vez (anular es idempotente: update a ANULADO y saldo 0)
Task 21: complete (commits 32b27f5..79f3a8b, review clean)
Task 22: minor (deferred, triage final): botón anular visible si la factura se emitió en otro ambiente (servidor lo rechaza); mensaje de éxito no se ve tras revalidate
Task 22: complete (commits 79f3a8b..e8421bd, review clean)
Task 23: minor (deferred): con un solo archivo el correo dice "(XML y PDF)"; escaparHtml importado de recordatorios/plantilla
Task 23: complete (commits e8421bd..c50eb48, review clean)
Task 24: implementer DONE 28e3f3c (full unit 384 files / 3134 tests); review dispatched. Ruling: rangoMesBogota en rango-mes.ts — un archivo use server solo exporta funciones async; costo: ninguno
Task 24: minor (deferred): registrarTokenBolsa sin try/catch en taller sin migrar (inalcanzable desde UI); campo token no se limpia tras guardar
Task 24: complete (commits c50eb48..28e3f3c, review clean)
Final review: dispatched (6d2b33f..28e3f3c, opus)
Final review: With fixes — 3 Important (recuperación 21b sin botón; cambio de fecha pisa la fecha aceptada en Regla 90; anuladas contadas como cobradas/ingreso) + minors
Ruling: se corrigen ahora los 3 Important + re-fechar activadaDesde al activar en producción + conceptos de NC limitados a 2 y 5, en un solo fix — costo si es incorrecto: mínimo
Ruling: el #3 (anuladas en Inicio y Rentabilidad) se corrige ya en vez de backlog: una factura anulada no es ingreso ni cobro; costo si es incorrecto: cifras de Inicio/Rentabilidad excluyen anuladas
Final fix: dispatched (FIX_BASE 28e3f3c, opus)
Final fix: DONE 191f342 (unit 1061, db 21/21); re-review dispatched
Final fix: re-review 5/5 ADDRESSED (28e3f3c..191f342)
Final: parked — reenvío con fecha nueva que termina en ERROR_TEMPORAL deja la fecha nueva; un segundo reintento ya no busca el día original — Ruling: se deja para después (arreglo: no persistir la fecha nueva hasta tener respuesta no temporal); costo si es incorrecto: una factura podría quedar POR_CONFIRMAR indefinida en ese caso raro
Final: minor (deferred): "Completar anulación" sin ConfirmacionEnLinea (recuperación idempotente); default del select de concepto probado con mock
Deploy: la migración 20261120130000 ya está aplicada en taller_dev y taller_dev_reference (2026-11-21); producción usa taller_dev

Resuelto 2026-11-21 (66e72bb): el caso "reenvío con fecha nueva + ERROR_TEMPORAL" ya conserva la fecha original (también con excepción, Regla 90 y ERROR_CONFIGURACION).

Pendiente externo: sandbox de Nextpyme (adaptador real, ambiente por tipo de documento, endpoint de copia de respuesta, pruebas de habilitación). Se retoma cuando Nextpyme envíe la información. Merge a main: después del sandbox.

Campos del cliente adelantados a main (1f130d1, desplegado 2026-11-21) con la migración 20261120130000 completa; ya aplicada en taller_dev y taller_dev_reference (public.tenants solo tiene taller_dev). Al unir esta rama a main, en los conflictos de src/app/(dashboard)/clientes/[id]/page.tsx, su page.test.tsx y src/modulos/factura-electronica/index.ts tomar la versión de esta rama. No hace falta volver a migrar.

Revisión 2026-11-21 de 8a07c80 (aprobado) y 66e72bb (con arreglos) → arreglo 7d51700 (aprobado): un reenvío otro día que la DIAN sí recibió con la respuesta perdida ahora se confirma buscando también con la fecha del intento anterior, y guarda la fecha con la que se halló; la aceptación guarda payload + estado + CUFE en una sola escritura.

Para el sandbox de Nextpyme (aparcados, limitación del proveedor: la búsqueda en el histórico es ±1 día y no devuelve la fecha):
- Leer la fecha real que aceptó la DIAN (cbc:IssueDate/IssueTime del XML que ya se descarga al aceptar, o la que devuelva el adaptador real) y corregir el payload al aceptar. Cierra la ambigüedad de ±1 día entre fechas contiguas.
- ultimoIntentoAt solo recuerda el último intento: con dos fallos seguidos (recepción perdida el día 3 y búsqueda SIN_CONFIRMAR el día 5) el día 3 queda fuera de las candidatas. Opción barata: en Regla 90 sin hallazgo, recorrer de la fecha guardada a hoy en saltos de 3 días.
- Minor: la hora guardada sale de ultimoIntentoAt y la enviada de un reloj nuevo (segundos de diferencia; pasar el mismo "ahora"). La candidata de hoy en confirmarPrevio casi siempre sobra (una llamada extra por reintento).
- Minor 8a07c80: ordenar por "Estado" en la lista mezcla anuladas con pagadas.
