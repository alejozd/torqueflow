# Roadmap — Módulos faltantes (Fases 15–25)

> Fecha: 2026-10-10. Origen: comparación contra competidores (Ingo Talleres, TallerCloud,
> TallERP, Tekmetric/AutoLeap) enfocada en talleres pequeños y medianos en Colombia.
> Este es el plan **total**: cada fase tendrá su propio spec + plan detallado
> (`brainstorming` → `writing-plans`) antes de implementarse.

## Convención de trabajo (desde Fase 15)

- **Cada fase en su propia rama**: `faseN-<slug>` (ej. `fase15-vehiculo-vencimientos`), creada desde `main`.
- Commits atómicos por tarea en la rama: `faseN-task X: descripción`, push de la rama tras cada tarea.
- Al cerrar la fase: revisión final de toda la rama → fix round → merge a `main` (trunk) con `--no-ff` y push.
- Cada fase arranca con su plan en `docs/superpowers/plans/AAAA-MM-DD-faseN-<slug>.md`.
- Facturación electrónica DIAN queda **fuera** de este roadmap (se planea aparte).
- Prerrequisito: terminar el plan en curso `fase-conf` (Task 11 review, Tasks 12–13, revisión final).

## Lista maestra (numeración del análisis)

**Alta:** 1 Gastos operativos · 2 Rentabilidad real · 3 Caja diaria · 4 Cuentas por cobrar ·
5 Anticipos · 6 SOAT/tecnomecánica · 7 Catálogo de servicios · 8 Liquidación de mecánicos ·
9 Importar desde Excel

**Media:** 10 Enlace público de la orden · 11 Kits de servicio · 12 Diagrama de daños ·
13 Acta de recepción con firma · 14 Garantías · 15 Alertas de órdenes estancadas ·
16 Prioridad en orden · 17 Tablero kanban · 18 Rendimiento por técnico · 19 VIN y tipo de vehículo ·
20 Encuesta posventa / reseña Google

**Baja:** 21 Horas por técnico · 22 Venta de mostrador · 23 Exportar CSV/PDF ·
24 Cuentas por pagar · 25 Flotas/clientes empresa · 26 Asistente IA · 27 Consulta RUNT ·
28 Exportación contable (Siigo/Alegra)

## Fases

| Fase | Rama | Ítems | Objetivo | Depende de |
|---|---|---|---|---|
| **15** | `fase15-vehiculo-vencimientos` | 6, 19 | Vehículo completo: SOAT, tecnomecánica, VIN, tipo carro/moto, recordatorios de vencimiento por wa.me/email | — |
| **16** | `fase16-gastos-rentabilidad` | 1, 2 | Gastos con categorías y recurrentes; reporte de rentabilidad (facturado − gastos, punto de equilibrio) | — |
| **17** | `fase17-caja-cartera` | 3, 4, 5 | Apertura/cierre/arqueo de caja, cartera con antigüedad, anticipos aplicables a factura | 16 |
| **18** | `fase18-catalogo-servicios` | 7, 11 | Catálogo de servicios con precio base y kits (servicio + repuestos + MO) usables en orden y cotización | — |
| **19** | `fase19-equipo-tecnico` | 8, 18, 21 | Liquidación de mecánicos (% o fijo), rendimiento por técnico, registro de horas | 18 (recomendado) |
| **20** | `fase20-importar-excel` | 9 | Importación con plantilla: clientes, vehículos, repuestos, servicios | 15, 18 |
| **21** | `fase21-recepcion-garantias` | 12, 13, 14 | Diagrama de daños, acta de recepción/entrega con firma, garantías por trabajo/repuesto | — |
| **22** | `fase22-flujo-taller` | 15, 16, 17 | Prioridad en orden, alertas de estancadas/sin entregar, tablero kanban | — |
| **23** | `fase23-portal-cliente` | 10, 20 | Enlace público del estado de la orden (DVI, cotización), encuesta/reseña posventa | 21 (recomendado) |
| **24** | `fase24-mostrador-compras` | 22, 23, 24 | Venta de mostrador con devoluciones, cuentas por pagar a proveedores, exportación CSV/PDF | 17 |
| **25** | *(backlog)* | 25, 26, 27, 28 | Flotas, asistente IA, RUNT, exportación contable — se replanifica junto a facturación electrónica | 17, DIAN |

### Orden sugerido

`fase-conf` (cerrar) → **15** (quick win) → **16** → **17** → **18** → **19** → **20** → **21** → **22** → **23** → **24** → 25 (backlog).

## Notas por fase (para el brainstorming de cada una)

- **15:** `Vehiculo` ya tiene `kilometraje` y `proximoMantenimiento`; agregar fechas de vencimiento y extender `MotivoRecordatorio` (hoy `KILOMETRAJE | TIEMPO`). Envío solo wa.me o SMTP (sin API de WhatsApp).
- **16:** modelo nuevo de gasto por sede; la recurrencia puede generarse al consultar el mes (sin cron) — decidir en el spec.
- **17:** `Pago` y `Factura.saldoPendiente` ya existen; la caja agrupa pagos por sede y método (`MetodoPago`). Anticipo = pago sin factura ligado a la orden, que se aplica al facturar.
- **18:** hoy `ManoDeObra` es descripción + valor libre; el catálogo debe prellenar, no reemplazar el texto libre.
- **19:** `ManoDeObra.mecanicoId` ya existe → base de la liquidación.
- **21:** el DVI ya maneja fotos (`DviFoto` con momento); diagrama y firma pueden ir como imágenes de la orden.
- **23:** enlace con token no adivinable, solo lectura, con expiración.
