# Pendientes del Plan 2a para el Plan 2b

Copia del registro de ejecución del Plan 2a (2026-11-21). Las líneas 'minor (deferred)' y 'Ruling:' son lo que el Plan 2b debe considerar.

| §11.4 vs plan | spec: last line keeps remainder; plan: largest-remainder | Ruling: follow plan (largest remainder) — plan documents conscious change so no line goes negative; cost if wrong: differing cent distribution only |
Task 4: minor (deferred): interpretarEmitidos Number(null)=0 → ENCONTRADO con total 0; exigir total numérico/no vacío
Task 4: minor (deferred): iva-incluido repartir total*p puede exceder 2^53 en facturas enormes
Task 4: minor (deferred): TIPO_FILTRO_EMITIDOS=1 sin confirmar en sandbox (ya listado en plan)
Task 4: minor (deferred): sin evidencia RED de TDD
Task 4: complete (commits 964c0c3..cfed580, review clean)
Task 5: Ruling: aceptar cambio extra en clientes/[id]/page.tsx (+6 campos) — necesario para tsc tras ampliar Cliente; costo si es incorrecto: ninguno funcional
Task 5: minor (deferred): no se prueba onDelete Restrict factura→documento
Task 5: minor (deferred): prisma generate EPERM en dll del motor (proceso node vivo); regenerar con dev detenido
Task 5: complete (commits cfed580..b669236, review clean)
Task 6: minor (deferred, carry to Task 8): lineasDesdePreciosConIva lanza Error genérico si descuento > subtotal; el servicio debe atraparlo antes de numerar
Task 6: minor (deferred): Number(ivaPct) sin guarda NaN; Map de memorias del simulado sin límite; prueba "con token" no verifica token descifrado; hora-bogota posible "undefined"
Task 6: complete (commits b669236..014192d, review clean)
Task 7: minor (deferred): sin test de ruta para .xml; firma XML débil ("<"); escritura no atómica; sin test prefijo malicioso
Task 7: complete (commits 014192d..f1d82e7, review clean)
Task 8: minor (deferred, triage in final): alinearFactura sin tope de |diferencia| (spec habla de centavo) — si la orden cambia tras facturar, reescribe total sin aviso
Task 8: minor (deferred): retry deja ENVIANDO si falla remap tras updateMany → reenvía payload viejo tras 2 min
Task 8: minor (deferred): mensaje "ya aceptado" también para ANULADO; emitirTrasFacturar null para crash y no-aplica; ventana 2 min vs timeout HTTP; sin índice único parcial (factura_id,tipo); faltan pruebas RANGO_AGOTADO/ENVIANDO interrumpido/ambiente en retry/choque
Task 8: complete (commits f1d82e7..cd2d8a9, review clean)
Task 9: minor (deferred): await de emitirTrasFacturar suma latencia HTTP del proveedor a crearFacturaAction en modo AUTOMATICO (plan-mandated); sin prueba de promesa rechazada
Task 9: complete (commits cd2d8a9..104ffaa, review clean)
Final review: dispatched (964c0c3..104ffaa, opus)
Final review: With fixes — 1 Important (alinearFactura sin tope + mapeo lanza Error crudo) + Minors
Ruling: se corrigen ahora Important 1 + Minor 1 (retry ENVIANDO) + Minor 2 (FOR UPDATE en alineación del retry) en un solo fix — baratos, misma función, el 2b construye encima; costo si es incorrecto: mínimo
Ruling: Minor 3 (único sin ambiente, P2002 sin manejar, GREATEST salta números) y Minor 4 (descarga sin permisos) se llevan al Plan 2b (pantalla de resolución y permisos) — costo si es incorrecto: choque silencioso al reiniciar contador con mismo prefijo; descarga por cualquier sesión del taller
Final fix: dispatched (FIX_BASE 104ffaa)
Final fix: DONE_WITH_CONCERNS f548a4b (unit 124/124, db 13/13; new MotivoFallaFe ERROR); re-review dispatched
Final fix: re-review — 3/3 ADDRESSED, no new Critical/Important (commits 104ffaa..f548a4b)
Final: minor (deferred): rama ERROR sin prueba; update de restauración sin guarda; intentos queda incrementado tras remapeo fallido; Plan 2b debe manejar MotivoFallaFe "ERROR"
Final: minor (deferred, Plan 2b): índice único sin ambiente/P2002 sin manejar/GREATEST salta números al cambiar resolución; descarga XML/PDF sin permiso específico
