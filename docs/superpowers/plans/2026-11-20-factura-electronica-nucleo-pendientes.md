# Pendientes del Plan 1 (núcleo) para el Plan 2

Copia del registro de ejecución del Plan 1 (2026-11-20). Las líneas 'minor (deferred)' y 'Ruling:' son lo que el Plan 2 debe considerar.

Ruling: none needed — scan clean.
Ruling: aceptar trailer Co-Authored-By Haiku en commit 574a6cf en vez del Opus del brief — la regla de atribución del harness manda el modelo real; costo si es incorrecto: solo cosmético en el historial
Task 1: minor (deferred): calculo.ts precio*cantidad en flotante; usar cantidad escalada a entero (Math.round(precio*Math.round(cantidad*100))/100 redondeado) — plan-mandated
Task 1: minor (deferred): dinero.ts comentario dice "no negativos" pero acepta negativos; sin tope MAX_SAFE_INTEGER
Task 1: minor (deferred): validacion else-if por línea reporta solo el primer defecto de cada línea
Task 1: minor (deferred): faltan pruebas: NIT no numérico, consumidor final contado válido, bordes de rango/vigencia
Task 1: minor (deferred): no valida formato de fecha/hora/vencimiento (para Plan 2)
Task 1: complete (commits d5a726e..574a6cf, review clean)
Task 2: minor (deferred): simulado no puede simular "caída pero la DIAN sí lo recibió" (CAIDA no registra el doc)
Task 2: minor (deferred): faltan pruebas: textos vacíos en traducirMensajesDian, consultarEstado tras RECHAZAR/CAIDA
Task 2: complete (commits 574a6cf..3de647c, review clean)
Task 3: Ruling: hallazgo plan-mandated (timeout/5xx en enviar → ERROR_TEMPORAL sin CUFE para consultar) se deja para el Plan 2 — la spec §3.2 ya define que el servicio reenvía con el mismo número y trata la Regla 90 (esDocumentoYaProcesado) como "ya estaba en la DIAN"; costo si es incorrecto: el Plan 2 debe recuperar el CUFE (histórico DIAN por fechas) o el documento queda sin CUFE local
Task 3: minor (deferred): ACEPTADO con cufe "" si la respuesta no trae CUFE; mejor ERROR_TEMPORAL
Task 3: minor (deferred): consultarEstado aceptado devuelve fechaValidacion ""
Task 3: minor (deferred): cualquier excepción de mapear se vuelve RECHAZADO (también bugs), catálogo faltante sería más bien error de configuración/datos
Task 3: minor (deferred): generador sin res.ok ni timeout
Task 3: minor (deferred): faltan pruebas: cuerpo no JSON/timeout, consultarEstado rechazado, 200 sin IsValid, 5xx en descargar
Task 3: complete (commits 3de647c..e7e4500, review clean)
Final review: With fixes — 1 Important de código (NIT sin normalizar) + 2 Important de plan (sin CUFE local; ambiente no verificado)
Ruling: se corrigen ahora NIT, frontera ESLint relativa, redondeo flotante y ACEPTADO sin CUFE (baratos y en el núcleo) — costo si es incorrecto: mínimo
Ruling: "CUFE local (claveTecnica + calcularCufe) vs capturar cufe de Nextpyme" y "probarConexion devuelve el ambiente real de Nextpyme" se llevan al Plan 2 como primeras tareas antes del servicio — el usuario decide en el diseño del Plan 2; costo si es incorrecto: notas crédito imposibles para facturas recuperadas por Regla 90 y riesgo de emitir en producción creyendo que es pruebas
Ruling: no se hace merge a main al cerrar el Plan 1 — RULES.md manda merge al cerrar la fase y fase-fe sigue con el Plan 2; costo si es incorrecto: la rama vive más tiempo sin integrarse
Final: parked — frontera ESLint no cubre escapes de 2 niveles desde la raíz del módulo (p. ej. ../../types) — Ruling: se deja; **/lib/** y @/* ya cubren lo usual y el grep de la tarea lo detectaría; costo si es incorrecto: un import indebido podría colarse hasta la revisión
