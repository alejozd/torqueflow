# Rediseño del Mostrador — propuesta

Estado: **aprobada por el usuario el 2026-10-15** con las 5 recomendaciones de §6 (ver "Decisiones tomadas").
Plan: `docs/superpowers/plans/2026-10-15-mostrador-rediseno.md`.

### Decisiones tomadas (2026-10-15)

- **D1 Cobro mixto:** sí. Varios `PagoVentaMostrador` por venta; vueltas solo sobre el efectivo.
- **D2 Descuento:** RECEPCION hasta un tope configurable (por defecto 10 %), ADMIN sin tope. El tope es
  una opción nueva del taller (`ConfiguracionTaller.descuentoMaxRecepcion`, migración de tenant).
- **D3 Cartera:** las ventas de mostrador con saldo pendiente aparecen en Cartera. Se reconocen por
  `VentaMostrador.saldoPendiente > 0` (estado distinto de PAGADA). Dejar saldo exige cliente
  registrado desde ahora; las ventas a crédito antiguas sin cliente se muestran como "Consumidor final".
- **D4 Devoluciones:** hasta 30 días después de la venta; si la venta es de una caja ya cerrada, solo ADMIN.
- **D5 Anular:** no se crea; "Devolver todo" cubre el caso.
Maqueta: `docs/Evidencias/mostrador/propuesta.html`.
Referencia: `docs/superpowers/specs/2026-10-15-cotizacion-rediseno-design.md`.

---

## 1. Diagnóstico del Mostrador actual

Archivos: `src/app/(dashboard)/mostrador/page.tsx`, `carrito-mostrador.tsx`, `cobrar-venta-form.tsx`,
`devolucion-form.tsx`; acciones `src/app/actions/venta-mostrador-actions.ts`,
`src/app/actions/devolucion-mostrador-actions.ts`; reglas puras `src/lib/mostrador/ventas.ts`.

### Lo que funciona (se conserva tal cual)

- **Reglas de negocio sólidas.** El stock se descuenta con guarda dentro de la transacción; precio y
  nombre del repuesto salen del servidor (hallazgo M2); el descuento se revalida con precios reales;
  los totales usan el mismo cálculo que la factura (`calcularTotalesVenta` → `computeFacturaTotales`).
- **"Disponible" real**: stock menos lo comprometido en órdenes abiertas (`getMostradorDatos`).
- **Devolución bien pensada**: reparte el descuento en proporción (`totalDevolucion`), tiene tope
  (`montoADevolverPermitido`), baja primero la deuda y solo el exceso sale del cajón (`montoEnEfectivo`).
  Ya usa `ConfirmacionEnLinea`.
- **Caja**: solo el efectivo exige caja abierta (`exigirCajaParaEfectivo`); la venta entra al arqueo
  como "Venta de mostrador" (`caja/caja-tablas.tsx`, `lib/caja/resumen.ts`).
- Roles: `ROLES_MOSTRADOR = ["ADMIN", "RECEPCION"]` para vender, cobrar y devolver.

### Lo que estorba

| # | Problema | Dónde |
|---|----------|-------|
| P1 | **Tres tarjetas apiladas** (Nueva venta · Ventas de hoy · Devoluciones): el recepcionista hace scroll para todo; el total y el botón de cobrar quedan abajo, lejos de la tabla. | `page.tsx` |
| P2 | El buscador está **fuera de la tabla**; tras "Agregar" el foco no va a ningún lado. No hay flechas ni Enter para elegir resultado: con lector de código de barras no se puede vender sin mouse. | `carrito-mostrador.tsx` L127-160 |
| P3 | **Repetir un repuesto crea otra fila** en vez de sumar cantidad (la cotización ya resolvió esto, D7). | `agregar()` |
| P4 | Cantidad con `<input type=number>` sin − / +, sin tope visible; el aviso de stock solo aparece en el desplegable. | tabla del carrito |
| P5 | Cliente con `SelectField` de hasta 500 nombres, sin búsqueda por nombre, cédula, teléfono o placa. No se puede crear un cliente rápido. | L262-272, `getMostradorDatos` (`take: 500`) |
| P6 | Cobro en **un solo método** y un checkbox "Cobrar todo ahora" difícil de entender. No hay "recibido / vueltas" para efectivo, ni pago mixto (efectivo + tarjeta), aunque el modelo sí lo admite (`PagoVentaMostrador[]`). | L276-299 |
| P7 | Tras guardar solo aparece "Venta #N registrada." en gris: **no hay comprobante** (imprimir, WhatsApp, correo) ni resumen de lo cobrado. | L340-344 |
| P8 | Ventas a crédito y devoluciones son **listas sueltas** debajo de la tabla del día, separadas de la venta a la que pertenecen. Solo se ven las de hoy: no se puede devolver algo vendido ayer. | `page.tsx` L74-118 |
| P9 | Las ventas a crédito del mostrador **no aparecen en Cartera** (solo facturas). | `cartera/` |
| P10 | `getMostradorDatos` manda **todo el inventario** de la sede al navegador para filtrar en el cliente. | acción |

---

## 2. Veredicto sobre reutilizar el esquema de la cotización

**Sí al esqueleto visual y a la interacción de captura; no a la persistencia ni a la tarjeta de
decisión.** La cotización es un *documento que se edita con calma y luego se aprueba*; el mostrador es
una *transacción de 30-60 segundos que termina en dinero en el cajón*. Se parecen en la tabla, no en el
ciclo de vida.

| Se reutiliza | Por qué |
|---|---|
| Buscador como **última fila de la tabla**, flechas + Enter, foco a cantidad (`buscador-conceptos.tsx`) | Es exactamente el flujo de teclado que pide un mostrador. Se extrae a un componente compartido parametrizado por la acción de búsqueda. |
| Fusión "repuesto ya presente → +1" (D7) | Arregla P3. Con lector de barras, escanear dos veces = cantidad 2. |
| Chip de disponibilidad verde/ámbar/rojo (`lib/cotizacion/disponibilidad.ts`) | Mismo lenguaje en toda la app, pero calculado con **disponible** (stock − comprometido), no con `stockActual`. |
| Columna lateral con **resumen económico** (`resumen-cotizacion.tsx`) | Mismo look; se generaliza el componente (título, filas opcionales, etiqueta del total). |
| Editor de descuento %/$ (`descuento-cotizacion-form.tsx`) | Misma UI, pero en estado local (no guarda en la base). El servidor sigue recibiendo un monto. |
| `ConfirmacionEnLinea` para quitar línea, vaciar carrito y devolver | Patrón ya vinculante. |

| NO se reutiliza | Por qué |
|---|---|
| `CeldaEditable` con **guardado al salir de la celda** | En la cotización cada edición es una server action contra un registro existente. En el mostrador **no existe venta hasta cobrar**: el carrito vive en el navegador. Guardar por celda crearía ventas a medias y apartaría stock que nadie pagó. Se reutiliza solo la *apariencia* (texto que se vuelve input con foco). |
| **Tarjeta de decisión** "Aprobar / Rechazar" | No hay aprobación. Su lugar lo toma la **tarjeta de cobro** (método, recibido, vueltas, botón Cobrar). |
| Kits / servicios y mano de obra en el buscador | El mostrador vende repuestos. La mano de obra suelta sigue como "línea libre" (ya existe), sin agrupar kits. Si se vende un kit, es otra historia (ver decisión 5). |
| Cabecera con placa y estado | El mostrador no tiene vehículo obligatorio; la cabecera es el **cliente** (o "Consumidor final") y el estado de la caja. |
| Precio editable de repuestos | El servidor impone el precio de catálogo (M2). Cambiar precio = descuento. Solo la línea libre lleva precio a mano. |

---

## 3. Propuesta de pantalla

Una sola vista con **dos pestañas** arriba: `Vender` (por defecto) · `Ventas` (historial,
cobros a crédito y devoluciones). El trabajo de vender ocupa toda la pantalla sin scroll.

### 3.1 Escritorio (≥ 1024 px)

```
┌───────────┬──────────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR   │ Mostrador                         [● Caja abierta · base $200.000] [Exportar]│
│ (oscuro)  │ [ Vender ]  Ventas (14 hoy)                                                   │
│           ├────────────────────────────────────────────────┬─────────────────────────────┤
│ Mostrador │ ┌ Cliente ──────────────────────────────────┐  │ ┌ Resumen ──────────── COP ┐ │
│  (activo) │ │ 👤 Consumidor final   [Buscar cliente F2] │  │ │ 4 productos · 8 unidades │ │
│           │ └───────────────────────────────────────────┘  │ │ Subtotal       $230.000  │ │
│           │ ┌ Productos ────────────────────────────────┐  │ │ Descuento [%|$] [  5 ] % │ │
│           │ │ Producto           Disp.   Cant.   Precio  │  │ │   −5 %         −$11.500  │ │
│           │ │                                   Importe  │  │ │ IVA 19 %        $41.515  │ │
│           │ │ Filtro aceite Mann ●12 [−][2][+] $28.000   │  │ │ ┏━━━━━━━━━━━━━━━━━━━━━━┓ │ │
│           │ │  W712/95                          $56.000 ✕│  │ │ ┃ TOTAL A COBRAR       ┃ │ │
│           │ │ Aceite 20W50 ¼  ●30 [−][4][+] $32.000      │  │ │ ┃          $260.015    ┃ │ │
│           │ │  MOB-20W50                       $128.000 ✕│  │ │ ┗━━━━━━━━━━━━━━━━━━━━━━┛ │ │
│           │ │ Bombillo H4     ◐ Solo 1 [1]    $18.000 ✕  │  │ └──────────────────────────┘ │
│           │ │ Instalación (libre) [1] [$ 28.000]       ✕ │  │ ┌ Cobro ──────────────────┐ │
│           │ │ 🔍 Escanea o escribe código / nombre… (F1) │  │ │ [Efectivo][Tarjeta][Transf]│
│           │ └───────────────────────────────────────────┘  │ │ Recibido  [ $300.000   ] │ │
│           │  [Vaciar carrito]          Esc limpia · F9 cobra│ │ │ [Justo][$270k][$300k]    │ │
│           │                                                │ │ Vueltas       $39.985    │ │
│           │                                                │ │ + Agregar otro método    │ │
│           │                                                │ │ [   Cobrar $260.015  F9 ]│ │
│           │                                                │ │ Dejar a crédito (solo con │ │
│           │                                                │ │  cliente registrado)     │ │
│           │                                                │ └──────────────────────────┘ │
└───────────┴────────────────────────────────────────────────┴─────────────────────────────┘
```

Columna principal ~ 2/3, lateral ~ 1/3 y **pegajosa** (`sticky top-4`) para que el total y "Cobrar"
nunca salgan de la vista.

### 3.2 Pantallas angostas (tablet / celular)

Una columna: Cliente → Productos → Resumen → Cobro. Una **barra inferior fija** con
"Total $260.015 · [Cobrar]" que lleva al bloque de cobro. Cantidad con botones − / + de 44 px; la
línea se quita con "✕" que abre la confirmación en línea. La tabla pasa a filas-tarjeta (nombre y
código arriba, cantidad e importe abajo).

### 3.3 Componentes y estados

| Estado | Qué ve el recepcionista |
|---|---|
| **Carrito vacío** | Tabla con solo la fila del buscador con foco y el texto "Escanea el código o escribe el nombre del repuesto". Resumen en $0; botón Cobrar deshabilitado con el motivo "Agrega al menos un producto". |
| **Con ítems** | Filas con chip de disponibilidad, − / + y quitar. Pie de tabla: "4 productos · 8 unidades". |
| **Sin stock / tope** | En el buscador el resultado aparece atenuado con chip rojo "Sin unidades libres" y Enter no lo agrega (mensaje en vivo `aria-live`). En la fila, el + se deshabilita al llegar al disponible y el chip pasa a ámbar "Solo hay N". Si al cobrar el servidor responde stock insuficiente, la fila afectada se marca en rojo y el carrito **no se vacía**. |
| **Cliente ocasional** | Tarjeta de cliente en gris "Consumidor final"; la opción "Dejar a crédito" no aparece. |
| **Cliente registrado** | Tarjeta con nombre, cédula/NIT, teléfono (botón WhatsApp wa.me para enviar el comprobante) y, si tiene, saldo pendiente en mostrador en ámbar. Se busca por nombre, documento, teléfono o **placa** (combobox con búsqueda en servidor, `components/ui/combobox.tsx`). Enlace "Crear cliente rápido" (nombre + teléfono + documento) en un `Dialog`. |
| **Caja cerrada** | Chip rojo "Caja cerrada" en la cabecera con enlace "Abrir caja". El botón "Efectivo" se deshabilita con su motivo; tarjeta y transferencia siguen. |
| **Cobro en efectivo** | Campo "Recibido" con atajos (Justo, siguientes billetes redondos) y "Vueltas" en grande. Recibido menor que el total → aviso "Faltan $X". |
| **Cobro mixto** | "+ Agregar otro método" añade una fila método + monto; la última fila se autocompleta con lo que falta. Las vueltas solo aplican al efectivo. El modelo ya lo soporta (`PagoVentaMostrador[]`); la acción hoy crea un único pago — hay que ampliarla, sin migración. |
| **A crédito / abono parcial** | Solo con cliente registrado: "Dejar a crédito" o pagar menos del total → la diferencia queda como saldo, se muestra "Queda debiendo $X" antes de confirmar. |
| **Venta cobrada** | El carrito se reemplaza por una **tarjeta de éxito** (no un texto gris): "Venta #1043 cobrada · $260.015 · Efectivo · Vueltas $39.985", con botones Imprimir comprobante (Ctrl+P), Enviar por WhatsApp (wa.me), Enviar por correo (SMTP, si tiene correo) y **"Nueva venta (Enter)"**. Enter arranca una venta limpia con foco en el buscador. |
| **Devolución** | Desde la pestaña Ventas o desde la tarjeta de éxito ("Devolver algo de esta venta"). Ver §4.3. |

---

## 4. Flujo de uso

### 4.1 Venta rápida (consumidor final, efectivo)

1. Entra a Mostrador: foco en el buscador.
2. Escanea / escribe "W712" → el primer resultado queda resaltado → **Enter** lo agrega con cantidad 1.
   Con lector de barras, el código exacto se agrega solo (sin abrir lista).
3. Escanea el mismo código otra vez → la fila pasa a cantidad 2 (no se duplica).
4. Para cambiar cantidad: **↑** desde el buscador sube a la última fila; `+` / `−` cambian la
   cantidad, o se escribe el número; **Enter** vuelve al buscador.
5. **F9** (o Ctrl+Enter) → foco en "Recibido" con el método Efectivo ya elegido. Escribe 300000 o
   pulsa el atajo de billete; ve las vueltas.
6. **Enter** cobra. Tarjeta de éxito → **Enter** = nueva venta, o **P** imprime el comprobante.

### 4.2 Venta a cliente registrado (con crédito o pago mixto)

1. **F2** abre la búsqueda de cliente; escribe "Valencia" o "JKT482" → Enter elige.
2. Agrega productos como en 4.1.
3. En Cobro elige Tarjeta por $150.000 y "+ Agregar otro método" Efectivo por el resto; o marca
   "Dejar a crédito" / cobra menos del total → aviso "Queda debiendo $X".
4. Cobrar. La venta a crédito aparece en la pestaña Ventas con saldo y, si se acepta la decisión 3,
   también en Cartera.

### 4.3 Devolución

1. Pestaña **Ventas** → busca por número de venta, cliente o producto (por defecto hoy; filtro de
   fechas para días anteriores).
2. Fila de la venta → acción "Devolver" abre un **panel lateral** (`Sheet`) con las líneas, cada una
   con − / + hasta lo devolvible ("vendidas 4, ya devueltas 1"). Botón "Devolver todo".
3. Motivo (lista corta: "No le sirvió", "Referencia equivocada", "Defecto", "Otro") y método de devolución.
4. El panel muestra **cuánto sale del cajón** y cuánto baja de la deuda antes de confirmar
   (la lógica ya existe: `montoEnEfectivo`).
5. "Devolver" → `ConfirmacionEnLinea` "Sale $X del cajón y 2 unidades vuelven a la bodega. ¿Devolver?"
   → comprobante de devolución (imprimir / wa.me).

### 4.4 Atajos de teclado (con ayuda visible: tecla `?` muestra la lista)

| Tecla | Acción |
|---|---|
| F1 o `/` | Ir al buscador de productos |
| ↑ / ↓ · Enter | Moverse en resultados · agregar |
| ↑ desde el buscador | Ir a la última fila del carrito |
| `+` / `−` en una fila | Subir / bajar cantidad |
| Supr en una fila | Quitar (abre la confirmación en línea; Enter confirma, Esc cancela) |
| F2 | Buscar / cambiar cliente |
| F4 | Descuento |
| F9 o Ctrl+Enter | Ir a cobrar / cobrar si ya está en el bloque de cobro |
| Esc | Limpia el buscador; con el buscador vacío no hace nada (vaciar carrito siempre con confirmación) |
| Enter (tras cobrar) | Nueva venta |

Se evitan F5 (recarga), F11 y Ctrl+N/T/W por chocar con el navegador.

---

## 5. Pestaña "Ventas" e integración con Caja y Facturas

- **KPI en una fila** (`components/ui/kpi-card.tsx`): Vendido hoy · Nº ventas · Efectivo en cajón por
  mostrador · Por cobrar (crédito) · Devuelto hoy.
- **Tabla** (`components/data-table.tsx`): Nº · Hora · Cliente · Productos (resumen "Filtro aceite ×2,
  +2 más") · Método(s) · Total · Saldo · Estado (Pagada / A crédito / Devuelta parcial / Devuelta).
  Filtros: hoy / ayer / rango; buscar por número, cliente, producto. Acciones por fila: Ver, Cobrar
  saldo (abre el mismo bloque de cobro en un `Sheet`), Devolver, Imprimir.
- Por defecto "hoy"; hoy solo se cargan las del día y no se puede devolver una venta de ayer (P8).
- **Caja**: sin cambios de modelo. El chip de caja en la cabecera enlaza a `/caja`; el arqueo ya suma
  ventas y devoluciones del mostrador.
- **Facturas**: `Factura.ordenId` es obligatoria y única, y la venta de mostrador es documento propio
  (Fase 24, D1). El comprobante del mostrador **no es factura electrónica**; la DIAN quedó aplazada
  (Fase 23). Cuando llegue, la venta de mostrador se facturará desde aquí, no desde Facturas.
- **Cartera**: hoy no ve las ventas de mostrador a crédito (P9) → decisión 3.

---

## 6. Decisiones abiertas

1. **¿Cobro mixto (varios métodos en una venta)?** Recomiendo **sí**: el modelo ya lo soporta, solo
   cambia la acción y la pantalla; es común "parte en efectivo, parte con tarjeta".
2. **¿Quién puede dar descuento?** Recomiendo: RECEPCION hasta un tope (p. ej. 10 %) y ADMIN sin tope;
   TECNICO no entra al mostrador (como hoy). Requiere una opción de taller nueva para el tope.
3. **¿Las ventas a crédito del mostrador entran a Cartera?** Recomiendo **sí**, en una sección
   "Mostrador" de Cartera, solo lectura con enlace a cobrar; si no, son deuda invisible.
4. **¿Devolver ventas de días anteriores?** Recomiendo **sí, hasta 30 días**, y que solo ADMIN pueda
   devolver ventas de una caja ya cerrada (la de RECEPCION queda en la caja abierta del día).
5. **¿Anular venta (en vez de devolver todo)?** Recomiendo **no** crear "anular": "Devolver todo" ya
   deja rastro auditado y reingresa stock; un botón de anular solo duplicaría el camino.

---

## 7. Esbozo de tareas de implementación

1. **Buscador compartido**: extraer de `cotizaciones/[id]/buscador-conceptos.tsx` un
   `components/buscador-conceptos.tsx` con acción inyectable; nueva `buscarParaMostradorAction`
   (repuestos con disponible, coincidencia exacta de código) en `venta-mostrador-actions.ts` (arregla P10).
2. **Carrito con teclado**: reescribir `mostrador/carrito-mostrador.tsx` como `tabla-carrito.tsx` +
   estado local con fusión +1, − / +, chip de disponibilidad y atajos (`use-atajos-mostrador.ts`).
3. **Resumen y descuento compartidos**: generalizar `resumen-cotizacion.tsx` a
   `components/resumen-economico.tsx` y el editor %/$ a modo local; usarlos en cotización y mostrador.
4. **Cliente rápido**: `mostrador/selector-cliente.tsx` con `components/ui/combobox.tsx` y búsqueda en
   servidor (nombre, documento, teléfono, placa) + `Dialog` de creación rápida.
5. **Cobro**: `mostrador/tarjeta-cobro.tsx` (métodos, recibido, vueltas, mixto, crédito) y ampliar
   `crearVentaMostradorAction` a `pagos[]` con su test (sin migración).
6. **Venta cobrada y comprobante**: `mostrador/venta-cobrada.tsx` + ruta imprimible del comprobante +
   texto wa.me y envío SMTP reutilizando el patrón de `enviar-cotizacion-form.tsx`.
7. **Pestaña Ventas**: `mostrador/ventas/` con KPI, `DataTable`, filtros de fecha y `Sheet` de
   devolución/cobro (reutiliza `devolucion-form.tsx` y `cobrar-venta-form.tsx`); `page.tsx` pasa a
   pestañas Vender / Ventas.
8. **Integración**: sección Mostrador en Cartera (si se aprueba la decisión 3) y prueba de punta a
   punta del flujo de teclado.
