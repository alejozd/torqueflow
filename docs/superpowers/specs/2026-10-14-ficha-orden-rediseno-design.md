# Rediseño de la ficha de la orden — entregas 1, 2 y 3

**Fecha:** 2026-10-14 · **Rama:** `ficha-orden` · **Estado:** aprobado por el usuario tras revisar el mockup con datos reales (#UI7ITHG3).

La entrega 4 (pestañas) queda fuera: se decide después de ver estas tres en la app.

## Problema

La ficha (`src/app/(dashboard)/ordenes/[id]/page.tsx`) mide ~3.000 px en Borrador y ~4.000 con todo abierto,
tiene 13 acciones con su propio botón, y:

- la cabecera casi no informa (placa, cliente y teléfono quedan en una línea gris o dentro de «Información»);
- avanzar de estado son 3 pasos (select → botón → confirmación) en la tercera tarjeta de la barra lateral;
- Totales no resta los anticipos: falta el **saldo por cobrar**;
- el diagrama de daños arranca con «Frente» elegido (un clic distraído marca un golpe en el frente);
- el checklist DVI tiene ~8–20 selects y un solo «Guardar» al final: se pierde si se pliega o se sale;
- los síntomas (lo que más consulta el mecánico) están al fondo de «Información», en texto plano.

## Decisiones

| # | Decisión |
|---|---|
| D1 | La sección «Información» desaparece: sus datos van a la **cabecera operativa**; los síntomas a un **banner**. |
| D2 | Un solo **botón de avance de fase** en la cabecera, según el estado (tabla abajo). **Anular** pasa a un menú «⋯» con `ConfirmacionEnLinea`. El select de `CambiarEstadoForm` desaparece; `updateEstadoOrdenAction` no cambia. |
| D3 | Barra lateral: **Prioridad** (ya aprobada, sin cambios) → **Ciclo de la orden** (pasos, sin botón) → **Cuenta** (fusiona Totales y Facturación, con saldo por cobrar). |
| D4 | Croquis del carro en **tres capas** en un solo SVG: silueta decorativa, zonas clicables (las de `figuras.ts`) y **un marcador numerado por daño**. Tarjetas de daño a la derecha con el mismo número. Sin fotos por daño. |
| D5 | **Sin zona elegida de entrada**: tocar una zona abre el formulario en línea (tipo en chips + nota + «Marcar daño»). La lista de zonas sigue disponible para teclado/«Otra zona». |
| D6 | Daños viejos `LATERAL_*` en carro: tarjeta en gris con aviso («marcado antes de separar los guardabarros…») y marcador gris **fuera del dibujo**, a su lado. |
| D7 | **Autoguardado** solo donde es seguro: checklist DVI (al marcar cada ítem), km y combustible de la recepción (combustible al elegir, km al salir del campo), mecánico (menú «Cambiar»). Indicador **por bloque** («Guardando…» / «✓ Guardado» / error) con `role="status"`. Nunca un «guardado hace X» global. |
| D8 | Siguen con confirmación explícita: agregar ítems, mano de obra, daños, anticipos y devoluciones, acta (firma y entrega), factura, anular. |
| D9 | Sin migraciones ni cambios de modelo. Las acciones existentes se reutilizan tal cual. |

### Botón de avance de fase (D2)

| Estado | Botón | Subtexto | Qué hace |
|---|---|---|---|
| BORRADOR | Pasar a En proceso → | Siguiente paso: empezar el trabajo | `updateEstadoOrdenAction(EN_PROCESO)` |
| EN_PROCESO | Marcar como terminada → | Siguiente paso: dejarla lista para entregar | `updateEstadoOrdenAction(TERMINADA)` |
| TERMINADA | Ir a la entrega → | Falta el acta firmada | enlace a `#entrega` (abre la sección) |
| ENTREGADA / ANULADA | (sin botón) | — | — |

Roles: los mismos de la acción (ADMIN, RECEPCION, TECNICO). Anular solo aparece donde la transición existe
(BORRADOR, EN_PROCESO). Si la acción responde error, se muestra bajo el botón.

## Componentes

**Cabecera operativa** (`cabecera-orden.tsx`, servidor + islas cliente):
placa en mono grande · marca, modelo, año, color y tipo · chip de estado con punto · cliente · teléfono (`tel:`) ·
WhatsApp (enlace `wa.me`, nunca API) · fila de datos: Ingresó, Recibió, Sede, Mecánico con «Cambiar ▾» ·
a la derecha: `#id`, menú «⋯» (Anular) y el botón de avance (`AvanceFase`, cliente).

**Mecánico** (`mecanico-menu.tsx`, cliente): igual que `PrioridadBloque` — menú que guarda al elegir con
`asignarMecanicoAction`; reemplaza a `AsignarMecanicoForm` (select + Guardar). Solo ADMIN/RECEPCION y orden editable;
si no, solo el nombre.

**Banner de síntomas**: franja izquierda ámbar, ícono, «El cliente reporta». Si no hay síntomas, no se pinta.

**Ciclo de la orden** (`ciclo-orden.tsx`, servidor): lista vertical CSS pura. Hecho = punto lleno verde; actual =
anillo con el color del estado; pendiente = punto gris. ANULADA reemplaza la lista por un aviso rojo.

**Cuenta**: Repuestos, Mano de obra, Total, − Anticipos vigentes, **Saldo por cobrar** (grande). Debajo:
«Ver factura #N» / «Generar factura» (TERMINADA o ENTREGADA, componente actual) / «Factura: al terminar».

**Croquis** (`diagrama-danios.tsx` + `figuras.ts`):
- `Figura.silueta` pasa a ser una lista de trazos con estilo (`{ d, tipo: "carroceria" | "vidrio" | "llanta" | "espejo" | "linea" | "farola" | "stop" }`)
  dibujados a mano sobre el lienzo actual (260×440 carro, 320×200 moto). Es decorado: `aria-hidden`, sin eventos.
- Zonas: mismas cajas (se permiten ajustes de pocos píxeles para calzar con el dibujo; los tests de no-solapamiento
  y de lienzo siguen). En reposo, trazo punteado tenue; hover/foco y elegida, relleno `primary`.
- Accesibilidad: `role="radiogroup"` / `role="radio"` + `aria-checked`, flechas para moverse, Enter/Espacio elige.
- Marcadores: uno por daño, numerados en orden de registro; varios en la misma zona se desplazan un poco.
  Hover sobre marcador ↔ tarjeta resalta la pareja.
- Moto: misma técnica con silueta lateral (ruedas, horquilla, tanque, asiento, escape).

**Autoguardado** (`use-autoguardado.ts`, hook cliente): cola que envía de a una petición (`startTransition` +
la acción existente), expone `estado: "inactivo" | "guardando" | "guardado" | "error"` y el mensaje de error.
- DVI: cada ítem se pinta como control segmentado (OK / Atención / Crítico) y envía solo su clave
  (`updateDviChecklistAction` ya mezcla con lo guardado). El título muestra «N de M revisados · X críticos».
- Recepción: `guardarRecepcionAction` con km y combustible actuales; combustible como control segmentado.

## Lo que se quita

`AsignarMecanicoForm`, `CambiarEstadoForm` (select), la sección «Información», el botón «Guardar checklist»,
el botón «Guardar recepción», las tarjetas «Totales», «Estado» y «Facturación», y la pill «Información» de la navegación.
`seccionesAbiertas` deja de conocer `informacion`.

## Errores

Cada bloque muestra su propio error bajo el control (`Alert` o texto `role="alert"`). En el autoguardado, si falla,
el indicador queda en error con el mensaje y el control vuelve a mostrar lo que hay guardado tras la revalidación.

## Pruebas

- Unitarias de cada componente nuevo (Vitest + Testing Library): avance de fase por estado, anular con
  confirmación, menú de mecánico, ciclo, cuenta (saldo), banner, croquis (sin zona inicial, abre formulario al
  tocar, marcadores numerados, daño viejo fuera del dibujo, teclado), autoguardado (cola en orden, estados, error).
- `figuras.test.ts` sigue verde (las cajas cambian, las reglas no).
- Verificación final en Chrome a ~1366 px con la orden #UI7ITHG3.

## Entregas (cada una con commit y push propios)

1. **Cabecera, banner y barra lateral** (D1–D3).
2. **Croquis y tarjetas de daño** (D4–D6).
3. **Autoguardado** (D7–D8).
