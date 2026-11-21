# Pendientes del Plan 2b para el Plan 2c

Copia del registro de ejecución del Plan 2b (2026-11-21). Las líneas 'minor (deferred)', 'Ruling:', 'Final' y 'Deploy' son lo que el Plan 2c y el despliegue deben considerar.

Task 10: Ruling: aceptar fixture extra activadaDesde: null en configuracion.test.ts — requerido por tsc; costo si es incorrecto: ninguno
Task 10: minor (deferred): comentario en migration.sql (~l.36) "no se repite por tipo y prefijo" no menciona ambiente; prisma generate EPERM (regenerar con dev detenido)
Task 10: complete (commits eb66697..260ba7e, review clean)
Task 11: minor (deferred): título del primer test del menú no coincide con lo que comprueba
Task 11: complete (commits 260ba7e..fb5add8, review clean)
Task 12: minor (deferred, Plan 2c): un solo tokenCifrado para BOLSA y PROPIA; al cambiar de cuenta se conserva el anterior
Task 12: minor (deferred): updates de guardar() en probarConexionFeAction sin try/catch
Task 12: minor rejected — "activadaDesde en @db.Date" falso: es TIMESTAMP(3) (T10), new Date() correcto
Task 12: complete (commits fb5add8..7b23c31, review clean)
Task 13: Ruling: Important "smtp/iva no pasan permisos" no aplica — configuracion.taller es PERMISOS_SOLO_ADMIN y el ADMIN tiene todos los permisos, así que quien ve esas páginas siempre puede entrar a FE; costo si es incorrecto: un enlace a /sin-permiso
Task 13: minor (deferred): doble resaltado en el menú en la página FE (plan-mandated); formRef sin uso; sin test que verifique envío de confirmarProduccion=si; new Date() en render cliente
Task 13: complete (commits 7b23c31..3869130, review clean)
Task 14: minor (deferred, triage final): take:1 sin orderBy si hay >1 documento FACTURA (servicio garantiza uno por FOR UPDATE, pero cambio de ambiente?); reenviar no filtra tipo FACTURA; cast de mensajes sin Array.isArray
Task 14: complete (commits 3869130..df1f9fd, review clean)
Task 15: minor (deferred): ancla #factura-electronica la crea T17 (resuelto en plan); getFacturaFe repite requirePermiso
Task 15: complete (commits df1f9fd..375d52f, review clean)
Task 16: Ruling: aceptar input oculto dian en el buscador — sin él la búsqueda pierde el filtro; costo si es incorrecto: ninguno
Task 16: minor (deferred): emptyMessage no refleja filtro DIAN vacío; aria-current solo en chip DIAN
Task 16: complete (commits 375d52f..f623f7d, review clean)
Task 17: minor (deferred, triage final): componente cliente importa mapear.ts → núcleo + municipios.json (93 KB) al bundle; DV guardado si tipo≠NIT; NIT sin documento no valida DV; sin role=status
Task 17: complete (commits f623f7d..45e57ee, review clean)
Task 18: minor (deferred → final review triage): contarFacturasSinEnviarDian sin .catch en Promise.all de Inicio; si la tabla FE no existe (migración sin aplicar) Inicio entero falla
Task 18: complete (commits 45e57ee..e4bcd65, review clean)
Full unit suite: 380 files / 3082 tests passed. Final review dispatched (eb66697..e4bcd65, opus)
Final review: With fixes — 3 Important (consecutivo al cambiar resolución → P2002 perpetuo; aceptado en Simulado/Pruebas se ve válido; ENVIANDO interrumpido nunca pendiente) + deploy note + minors
Ruling: se corrigen ahora 1, 3, la etiqueta mínima de 2 y los menores baratos (bundle cliente, fieldset, formRef/ahora, comentario SQL, Array.isArray, emptyMessage) en un solo fix — costo si es incorrecto: mínimo
Ruling: el flujo completo Simulado/Pruebas→Producción (reiniciar activadaDesde y consecutivo, documento por ambiente) pasa al Plan 2c con decisión del usuario — costo si es incorrecto: ventas reales hechas durante la práctica quedan con documento simulado y no se envían a producción
Ruling: se rechaza el .catch(() => 0) en Inicio — sin la migración se cae media app (columnas nuevas en clientes); la migración es paso obligatorio previo al despliegue — costo si es incorrecto: ninguno si se respeta el orden de despliegue
Final fix: dispatched (FIX_BASE e4bcd65)
Final fix: DONE 849fa19 (1023 tests GREEN); re-review dispatched
Final fix: re-review 9/9 ADDRESSED, sin nueva rotura Critical/Important (e4bcd65..849fa19)
Final: minor (deferred): ENVIO_INTERRUMPIDO_MS duplicado en textos.ts (prueba de igualdad); fieldset disabled no verificado en SelectField/CampoMunicipio (probar en navegador); aggregate de consecutivoInicial fuera del try/catch; sin prueba del emptyMessage DIAN
Final (Plan 2c): transición Simulado/Pruebas→Producción (activadaDesde, consecutivo, documento por ambiente); token único BOLSA/PROPIA; reenviar sin filtro tipo FACTURA
Deploy: la migración 20261120130000 debe aplicarse (con permiso) a todos los talleres y al esquema de referencia ANTES del build y reinicio
