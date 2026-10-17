# Fase 26 — Permisos por usuario: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar el control de acceso de "¿qué rol es?" a "¿tiene este permiso?". Con eso se tapan los huecos que tiene hoy el técnico, se agrega el rol **Jefe de taller** y el admin puede agregar o quitar permisos sueltos a cada usuario sin cambiarle el rol.

**Architecture:** Hay un catálogo único de permisos con nombre (`src/lib/auth/permisos.ts`, sin dependencias de servidor) y una tabla rol → permisos. `requireSession` ya consulta al usuario en cada petición: esa misma consulta trae ahora el rol y las excepciones, y calcula los permisos efectivos. Las acciones usan `requirePermiso("…")`, las pantallas usan `puede(session, "…")` y el menú recibe la lista de permisos. Las excepciones son dos columnas `text[]` en `usuarios`.

**Tech Stack:** Next.js (versión del repo — ver `AGENTS.md`), NextAuth JWT, Prisma 6.19.3 multi-schema (`prisma/tenant`), Vitest (`npm test` = proyecto `unit`), Zod.

**Spec:** Esta conversación de diseño, resumida en "Decisiones" abajo. Este documento es la referencia.

## Global Constraints

- Rama única: `fase26-permisos` desde `main`. Commits `fase26-task N: …`, con push después de cada tarea. Cierre con `git merge --no-ff` a `main`.
- `RULES.md` aplica completo: no reintentar automáticamente, máximo un intento de corrección por error, reportes de 3 a 5 líneas.
- Al terminar cada tarea: decir "vamos en X de 17" y preguntar antes de seguir.
- Verificación por tarea: `npx tsc --noEmit --incremental false`, `npm test` (pegar la línea "Test Files / Tests") y `npx eslint <archivos tocados>`.
- Antes de usar APIs de Next (`redirect`, `notFound`, server actions), leer la guía en `node_modules/next/dist/docs/`.
- Textos en español de Colombia y lenguaje sencillo. Los nombres de permisos (claves) van en código como `grupo.accion` en camelCase y **nunca se renombran** una vez estén en `main`.
- **Bloque A (tareas 1 a 8) no cambia el comportamiento.** Cualquier diferencia contra la tabla de paridad es un bug.
- Migraciones: se escribe el SQL a mano en `prisma/tenant/migrations/<timestamp>_<slug>/migration.sql`, se corre `npx prisma generate --schema prisma/tenant/schema.prisma` y se comprueba con el `migrate diff` de `docs/TRASPASO-AGENTES.md` §2. **No se aplica a ninguna base** hasta el cierre, con respaldo y aprobación del usuario. Dev y prod comparten base.

## Decisiones

- **D1.** Permisos efectivos = permisos del rol + `permisosAgregados` − `permisosQuitados`. El ADMIN tiene **todos** los permisos e ignora las excepciones.
- **D2.** Hay 4 permisos ★ **solo para ADMIN**: `usuarios.gestionar`, `sedes.gestionar`, `sedes.verTodas` y `configuracion.taller`. No se pueden agregar a otro usuario (se ignoran al calcular y la validación los rechaza).
- **D3.** Un permiso guardado que ya no exista en el catálogo se ignora en silencio; nunca rompe el inicio de sesión.
- **D4.** El rol y las excepciones se leen de la base en cada petición, dentro de la consulta que `requireSession` ya hace. Un cambio de permisos aplica en la siguiente acción del usuario, sin cerrar sesión. Como efecto lateral, un usuario degradado de rol pierde los permisos de inmediato y no en una hora.
- **D5.** Si falta un permiso, el usuario va a `/sin-permiso` (página dentro del dashboard con botón "Volver al inicio"). Ya no se manda a `/login?error=forbidden`.
- **D6.** Cuarto rol: **`JEFE_TALLER`** ("Jefe de taller"). Maneja el taller completo (órdenes, citas, cotizaciones, inventario, compras, servicios, productividad), pero nada de plata (facturas, caja, cartera, mostrador, gastos, rentabilidad). Necesita sedes asignadas, igual que el técnico, y **puede ser asignado como mecánico**.
- **D7.** El técnico ve **solo las órdenes donde es el mecánico de la orden o de alguna mano de obra**. Para eso existe el permiso `ordenes.verTodas`.
- **D8.** El técnico pierde `ordenes.anular`, `facturas.ver`, `inventario.costos` y `compras.ver`. Sigue viendo repuestos y stock, pero sin precio de compra, margen ni valor del inventario.
- **D9.** El bypass de sede del ADMIN durante el inicio de sesión (`sede-access.ts`) se queda con `role === "ADMIN"`, porque es estructural y vive en `lib/auth`. En pantallas y acciones ese bypass pasa a ser el permiso `sedes.verTodas`.
- **D10.** Fuera de alcance: roles personalizados por taller (etapa 3), ocultar precios de venta al técnico y cambiar los textos de la auditoría vieja.

## Catálogo de permisos y paridad

Columnas: **R** = RECEPCION, **T** = TECNICO, **J** = JEFE_TALLER (se agrega en la tarea 12). El ADMIN tiene todo. "A→" indica que el valor cambia en el bloque B; el valor del bloque A es el de hoy.

| Permiso | Etiqueta (UI) | R | T | J | Hoy lo exige |
|---|---|---|---|---|---|
| `clientes.ver` | Ver clientes y vehículos | ✓ | ✓ | ✓ | páginas `/clientes`, `/clientes/[id]`, `/vehiculos/[id]` |
| `clientes.editar` | Crear y editar clientes y vehículos | ✓ | | ✓ | create/updateClienteAction, create/updateVehiculoAction |
| `clientes.eliminar` | Eliminar clientes y vehículos | ✓ | | | deleteClienteAction, deleteVehiculoAction, `puedeEliminar` en clientes/[id] |
| `vehiculos.catalogo` | Agregar marcas y modelos | | | ✓ | crearMarca/ModeloVehiculoAction, `esAdmin` de los diálogos de vehículo y de NuevaOrdenDialog |
| `citas.ver` | Ver citas | ✓ | ✓ | ✓ | `/citas`, `/citas/[id]` |
| `citas.gestionar` | Crear y mover citas | ✓ | | ✓ | create/update/cambiarEstadoCitaAction |
| `citas.eliminar` | Eliminar citas | | | ✓ | deleteCitaAction, botón en citas/[id] (línea ~180) |
| `cotizaciones.ver` | Ver cotizaciones | ✓ | ✓ | ✓ | `/cotizaciones`, `/cotizaciones/[id]` |
| `cotizaciones.gestionar` | Crear, enviar, aprobar y rechazar cotizaciones | ✓ | | ✓ | crear/eliminarItem/actualizarDescuento/enviar/aprobar/rechazarCotizacionAction, eliminarGrupoKitCotizacionAction |
| `cotizaciones.editarItems` | Agregar ítems y seguimiento a cotizaciones | ✓ | ✓ | ✓ | agregarRepuestoACotizacion, agregarItemLibreCotizacion, actualizarItemCotizacion, registrarSeguimiento, buscarParaCotizacion, aplicarServicioACotizacion |
| `ordenes.ver` | Ver órdenes | ✓ | ✓ | ✓ | `/ordenes`, `/ordenes/[id]` |
| `ordenes.verTodas` | Ver todas las órdenes de la sede | ✓ | ✓ A→ ✗ | ✓ | (nuevo; tarea 10) |
| `ordenes.crear` | Crear órdenes | ✓ | | ✓ | createOrdenAction, createOrdenDesdeVehiculoAction |
| `ordenes.trabajar` | Agregar trabajo a la orden (ítems, mano de obra, DVI, recepción, acta, garantías) | ✓ | ✓ | ✓ | addItemOrden, addManoDeObra, aplicarServicioAOrden, addHistorialEntry, updateDviChecklist, addDviFoto, guardarRecepcion, agregarDanio, guardarActa, firmarActa, agregarGarantia, listGarantiasDeVehiculo |
| `ordenes.quitar` | Quitar ítems, fotos, daños, actas y garantías | ✓ | | ✓ | deleteItemOrden, deleteManoDeObra, deleteDviFoto, quitarDanio, borrarActa, quitarGarantia, `puedeQuitar` y `puedeCrearRepuesto` de ordenes/[id] |
| `ordenes.cambiarEstado` | Cambiar el estado de la orden | ✓ | ✓ | ✓ | updateEstadoOrdenAction (todo menos ANULADA) |
| `ordenes.anular` | Anular órdenes | ✓ | ✓ A→ ✗ | ✓ | updateEstadoOrdenAction a ANULADA (hoy sin control; tarea 11) |
| `ordenes.entregar` | Entregar el vehículo | ✓ | ✓ | ✓ | entregarOrdenAction |
| `ordenes.planificar` | Prioridad y asignar mecánico | ✓ | | ✓ | cambiarPrioridadAction, asignarMecanicoAction (orden sin mecánico) |
| `ordenes.reasignarMecanico` | Cambiar el mecánico ya asignado | | | ✓ | asignarMecanicoAction (orden con mecánico, `orden-actions.ts:508`), botón de ordenes/[id] (línea ~272) |
| `vencimientos.avisar` | Avisar vencimientos a clientes | ✓ | | ✓ | registrarAvisoWhatsappAction, `puedeAvisar` en vencimientos, `mostrarVencimientos` en Inicio |
| `facturas.ver` | Ver facturas | ✓ | ✓ A→ ✗ | | listFacturas, getFactura, listOrdenesFacturables, `/facturas`, `/facturas/[id]` |
| `facturas.facturar` | Facturar y registrar pagos | ✓ | | | crearFacturaAction, registrarPagoAction |
| `mostrador.vender` | Vender y devolver en mostrador | ✓ | | | las 9 acciones con ROLES_MOSTRADOR, crearDevolucionAction, `/mostrador` |
| `mostrador.descuentoSinTope` | Descuento sin tope | | | | tope de `venta-mostrador-actions.ts:170`, `descuentoPermitido` |
| `mostrador.devolverConCajaCerrada` | Devolver ventas de cajas ya cerradas | | | | `plazo-devolucion.ts:56` |
| `anticipos.registrar` | Registrar anticipos | ✓ | | | registrarAnticipoAction, `puedeGestionarAnticipos` |
| `anticipos.devolver` | Devolver anticipos | | | | devolverAnticipoAction |
| `caja.usar` | Abrir y cerrar caja | ✓ | | | getCajaActual, abrir/cerrarCaja, listCajasCerradas, `/caja` |
| `cartera.ver` | Ver cartera | ✓ | | | getCartera, `/cartera` |
| `cuentasPorPagar.usar` | Cuentas por pagar y abonos | ✓ | | | las 3 acciones con ROLES_ABONO, `/cuentas-por-pagar` |
| `gastos.registrar` | Registrar gastos | ✓ | | | crearGasto, listGastos, listRecurrentesPendientes, listCategoriasGasto (soloActivas), `/gastos` |
| `gastos.administrar` | Editar y borrar gastos, recurrentes y categorías | | | | actualizar/eliminarGasto, 6 de gasto-recurrente, categorías (crear/renombrar/toggle y listar inactivas), `/gastos/configuracion`, `cargarPlantillasParaPendientes`, `esAdmin` de gastos/page |
| `inventario.ver` | Ver repuestos, bodegas y proveedores | ✓ | ✓ | ✓ | `/repuestos`, `/bodegas`, `/proveedores` |
| `inventario.editar` | Crear y editar repuestos, bodegas y proveedores | ✓ | | ✓ | CRUD de repuesto, bodega y proveedor, guardarPospuesta (alertas) |
| `inventario.costos` | Ver costos, márgenes y valor del inventario | ✓ | ✓ A→ ✗ | ✓ | (nuevo; tarea 11) |
| `compras.ver` | Ver pedidos y entradas | ✓ | ✓ A→ ✗ | ✓ | listPedidosCompra, getPedidoCompra, getEnlaceWhatsappPedido, listEntradas, getEntrada |
| `compras.gestionar` | Crear pedidos y entradas | ✓ | | ✓ | crearPedidosCompra, pedidoParaAccion, createEntradaMercancia, addEntradaItem |
| `servicios.gestionar` | Crear y editar servicios | | | ✓ | CRUD de servicio, listServicios (todos), `/servicios`, hoja de servicios en `importacion-actions.ts:473`, menú Servicios |
| `reportes.productividad` | Reporte de productividad | | | ✓ | getReporteProductividad |
| `reportes.rentabilidad` | Reporte de rentabilidad | | | | getReporteRentabilidad |
| `liquidaciones.gestionar` | Liquidaciones de mecánicos | | | | las 7 de liquidacion-actions, `/liquidaciones` |
| `importar.usar` | Importar desde Excel | ✓ | | | importarAction, plantilla GET, `/importar` |
| `exportar.usar` | Exportar a Excel | ✓ | | | `api/exportar/[reporte]` GET |
| `auditoria.ver` | Ver auditoría | | | | listAuditLog, `/auditoria` |
| `usuarios.gestionar` ★ | Gestionar usuarios | | | | usuario-actions (5), `/usuarios*` |
| `sedes.gestionar` ★ | Gestionar sedes | | | | getSede, listSedesConMetricas, create/update/deleteSede, `/sedes` |
| `sedes.verTodas` ★ | Trabajar con todas las sedes | | | | listSedes, selectores de sede en caja/cartera/gastos, `caja-actions.ts:246`, `gastos/validaciones-db.ts:9` |
| `configuracion.taller` ★ | Configuración del taller y correo | | | | guardarOpcionesTaller/DiasEstancada/DiasAviso, las 4 de smtp, DVI checklist items, `puedeConfigurar` en vencimientos |

Lecturas que **siguen con `requireSession`** porque las usan varios módulos (la protección queda en la página, tarea 9): `listClientes*`, `getCliente`, `listVehiculos*`, `getVehiculo`, `listCitas`, `getCita`, `listCotizaciones`, `getCotizacion`, `listOrdenes*`, `getOrden` (estas dos se acotan en la tarea 10), `listTecnicos`, `listRepuestos`, `listRepuestoOptions`, `getRepuesto`, `getComprometidoPorRepuesto`, `listBodegas*`, `getBodega`, `listProveedores*`, `getProveedor`, `listHistorial`, `listAnticiposDeOrden`, `listDviChecklistItems`, `listVencimientos`, marcas y modelos, `get*` de configuración, `getDashboardOverview` y `getAlertasTaller`.

---

## Bloque A — Permisos con nombre (sin cambio visible)

### Task 1: Catálogo de permisos y tabla de roles

**Files:**
- Create: `src/lib/auth/permisos.ts`
- Create: `src/lib/auth/permisos.test.ts`
- Modify: `src/lib/auth/guards.ts:7` (el tipo `Role` pasa a importarse desde `permisos.ts`)
- Modify: `src/types/next-auth.d.ts` (`TorqueFlowRole` = `Role`)
- Modify: `src/lib/validation/usuario.ts:3` (`z.enum(ROLES)`), `src/app/actions/usuario-actions.ts:59,108` y `src/auth.ts:60` (usar `Role`)

**Interfaces:**
- Produces:
  - `ROLES: readonly ["ADMIN", "TECNICO", "RECEPCION"]` y `type Role`
  - `PERMISOS: Record<Permiso, { grupo: GrupoPermiso; etiqueta: string }>` y `type Permiso`
  - `GRUPOS_PERMISO: readonly GrupoPermiso[]` (orden de la UI: "Clientes y vehículos", "Citas", "Cotizaciones", "Órdenes", "Dinero", "Inventario", "Administración")
  - `PERMISOS_SOLO_ADMIN: readonly Permiso[]`
  - `PERMISOS_POR_ROL: Record<Exclude<Role, "ADMIN">, readonly Permiso[]>`
  - `esPermiso(valor: string): valor is Permiso`
  - `permisosEfectivos(entrada: { role: Role; agregados?: readonly string[]; quitados?: readonly string[] }): Permiso[]` (en esta tarea ignora `agregados` y `quitados`; la tarea 13 los aplica)
  - `tienePermiso(permisos: readonly Permiso[], permiso: Permiso): boolean`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/lib/auth/permisos.test.ts
import { describe, expect, it } from "vitest";
import { PERMISOS, PERMISOS_POR_ROL, PERMISOS_SOLO_ADMIN, esPermiso, permisosEfectivos, tienePermiso, type Permiso } from "./permisos";

const TODOS = Object.keys(PERMISOS) as Permiso[];

describe("catálogo de permisos", () => {
  it("cada clave sigue grupo.accion y tiene etiqueta", () => {
    for (const clave of TODOS) {
      expect(clave).toMatch(/^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$/);
      expect(PERMISOS[clave].etiqueta.length).toBeGreaterThan(0);
    }
  });

  it("los roles solo usan permisos del catálogo y nunca los ★", () => {
    for (const permisos of Object.values(PERMISOS_POR_ROL)) {
      for (const permiso of permisos) {
        expect(esPermiso(permiso)).toBe(true);
        expect(PERMISOS_SOLO_ADMIN).not.toContain(permiso);
      }
    }
  });

  it("ADMIN tiene todos los permisos", () => {
    expect([...permisosEfectivos({ role: "ADMIN" })].sort()).toEqual([...TODOS].sort());
  });

  it("esPermiso rechaza claves desconocidas", () => {
    expect(esPermiso("ordenes.ver")).toBe(true);
    expect(esPermiso("ordenes.volar")).toBe(false);
  });
});

// Paridad con el comportamiento de hoy (bloque A). Si un test de estos cambia,
// el cambio es de comportamiento y tiene que estar en el bloque B.
describe("paridad de roles con requireRole de hoy", () => {
  const recepcion = permisosEfectivos({ role: "RECEPCION" });
  const tecnico = permisosEfectivos({ role: "TECNICO" });

  it.each<Permiso>([
    "clientes.editar", "clientes.eliminar", "citas.gestionar", "cotizaciones.gestionar",
    "ordenes.crear", "ordenes.quitar", "ordenes.planificar", "facturas.facturar", "mostrador.vender",
    "anticipos.registrar", "caja.usar", "cartera.ver", "cuentasPorPagar.usar", "gastos.registrar",
    "inventario.editar", "compras.gestionar", "importar.usar", "exportar.usar", "vencimientos.avisar",
  ])("RECEPCION puede %s y TECNICO no", (permiso) => {
    expect(tienePermiso(recepcion, permiso)).toBe(true);
    expect(tienePermiso(tecnico, permiso)).toBe(false);
  });

  it.each<Permiso>([
    "clientes.ver", "citas.ver", "cotizaciones.ver", "cotizaciones.editarItems", "ordenes.ver",
    "ordenes.verTodas", "ordenes.trabajar", "ordenes.cambiarEstado", "ordenes.anular", "ordenes.entregar",
    "facturas.ver", "inventario.ver", "inventario.costos", "compras.ver",
  ])("RECEPCION y TECNICO pueden %s", (permiso) => {
    expect(tienePermiso(recepcion, permiso)).toBe(true);
    expect(tienePermiso(tecnico, permiso)).toBe(true);
  });

  it.each<Permiso>([
    "vehiculos.catalogo", "citas.eliminar", "ordenes.reasignarMecanico", "mostrador.descuentoSinTope",
    "mostrador.devolverConCajaCerrada", "anticipos.devolver", "gastos.administrar", "servicios.gestionar",
    "reportes.productividad", "reportes.rentabilidad", "liquidaciones.gestionar", "auditoria.ver",
    "usuarios.gestionar", "sedes.gestionar", "sedes.verTodas", "configuracion.taller",
  ])("solo ADMIN puede %s", (permiso) => {
    expect(tienePermiso(recepcion, permiso)).toBe(false);
    expect(tienePermiso(tecnico, permiso)).toBe(false);
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run --project unit src/lib/auth/permisos.test.ts`
Expected: FAIL, no se puede resolver `./permisos`.

- [ ] **Step 3: Implementar `permisos.ts`**

```ts
// src/lib/auth/permisos.ts
// Sin imports de servidor: lo usan también componentes de cliente (menú, ficha de usuario).

export const ROLES = ["ADMIN", "TECNICO", "RECEPCION"] as const;
export type Role = (typeof ROLES)[number];

export const GRUPOS_PERMISO = [
  "Clientes y vehículos", "Citas", "Cotizaciones", "Órdenes", "Dinero", "Inventario", "Administración",
] as const;
export type GrupoPermiso = (typeof GRUPOS_PERMISO)[number];

/** Claves estables: se guardan en la base (excepciones por usuario). Nunca renombrar. */
export const PERMISOS = {
  "clientes.ver": { grupo: "Clientes y vehículos", etiqueta: "Ver clientes y vehículos" },
  "clientes.editar": { grupo: "Clientes y vehículos", etiqueta: "Crear y editar clientes y vehículos" },
  "clientes.eliminar": { grupo: "Clientes y vehículos", etiqueta: "Eliminar clientes y vehículos" },
  "vehiculos.catalogo": { grupo: "Clientes y vehículos", etiqueta: "Agregar marcas y modelos" },
  "citas.ver": { grupo: "Citas", etiqueta: "Ver citas" },
  "citas.gestionar": { grupo: "Citas", etiqueta: "Crear y mover citas" },
  "citas.eliminar": { grupo: "Citas", etiqueta: "Eliminar citas" },
  "cotizaciones.ver": { grupo: "Cotizaciones", etiqueta: "Ver cotizaciones" },
  "cotizaciones.gestionar": { grupo: "Cotizaciones", etiqueta: "Crear, enviar, aprobar y rechazar cotizaciones" },
  "cotizaciones.editarItems": { grupo: "Cotizaciones", etiqueta: "Agregar ítems y seguimiento a cotizaciones" },
  "ordenes.ver": { grupo: "Órdenes", etiqueta: "Ver órdenes" },
  "ordenes.verTodas": { grupo: "Órdenes", etiqueta: "Ver todas las órdenes de la sede" },
  "ordenes.crear": { grupo: "Órdenes", etiqueta: "Crear órdenes" },
  "ordenes.trabajar": { grupo: "Órdenes", etiqueta: "Agregar trabajo a la orden" },
  "ordenes.quitar": { grupo: "Órdenes", etiqueta: "Quitar ítems, fotos, daños, actas y garantías" },
  "ordenes.cambiarEstado": { grupo: "Órdenes", etiqueta: "Cambiar el estado de la orden" },
  "ordenes.anular": { grupo: "Órdenes", etiqueta: "Anular órdenes" },
  "ordenes.entregar": { grupo: "Órdenes", etiqueta: "Entregar el vehículo" },
  "ordenes.planificar": { grupo: "Órdenes", etiqueta: "Prioridad y asignar mecánico" },
  "ordenes.reasignarMecanico": { grupo: "Órdenes", etiqueta: "Cambiar el mecánico ya asignado" },
  "vencimientos.avisar": { grupo: "Clientes y vehículos", etiqueta: "Avisar vencimientos a clientes" },
  "facturas.ver": { grupo: "Dinero", etiqueta: "Ver facturas" },
  "facturas.facturar": { grupo: "Dinero", etiqueta: "Facturar y registrar pagos" },
  "mostrador.vender": { grupo: "Dinero", etiqueta: "Vender y devolver en mostrador" },
  "mostrador.descuentoSinTope": { grupo: "Dinero", etiqueta: "Dar descuentos sin tope" },
  "mostrador.devolverConCajaCerrada": { grupo: "Dinero", etiqueta: "Devolver ventas de cajas ya cerradas" },
  "anticipos.registrar": { grupo: "Dinero", etiqueta: "Registrar anticipos" },
  "anticipos.devolver": { grupo: "Dinero", etiqueta: "Devolver anticipos" },
  "caja.usar": { grupo: "Dinero", etiqueta: "Abrir y cerrar caja" },
  "cartera.ver": { grupo: "Dinero", etiqueta: "Ver cartera" },
  "cuentasPorPagar.usar": { grupo: "Dinero", etiqueta: "Cuentas por pagar y abonos" },
  "gastos.registrar": { grupo: "Dinero", etiqueta: "Registrar gastos" },
  "gastos.administrar": { grupo: "Dinero", etiqueta: "Editar y borrar gastos, recurrentes y categorías" },
  "inventario.ver": { grupo: "Inventario", etiqueta: "Ver repuestos, bodegas y proveedores" },
  "inventario.editar": { grupo: "Inventario", etiqueta: "Crear y editar repuestos, bodegas y proveedores" },
  "inventario.costos": { grupo: "Inventario", etiqueta: "Ver costos, márgenes y valor del inventario" },
  "compras.ver": { grupo: "Inventario", etiqueta: "Ver pedidos y entradas" },
  "compras.gestionar": { grupo: "Inventario", etiqueta: "Crear pedidos y entradas" },
  "servicios.gestionar": { grupo: "Inventario", etiqueta: "Crear y editar servicios" },
  "reportes.productividad": { grupo: "Administración", etiqueta: "Reporte de productividad" },
  "reportes.rentabilidad": { grupo: "Administración", etiqueta: "Reporte de rentabilidad" },
  "liquidaciones.gestionar": { grupo: "Administración", etiqueta: "Liquidaciones de mecánicos" },
  "importar.usar": { grupo: "Administración", etiqueta: "Importar desde Excel" },
  "exportar.usar": { grupo: "Administración", etiqueta: "Exportar a Excel" },
  "auditoria.ver": { grupo: "Administración", etiqueta: "Ver auditoría" },
  "usuarios.gestionar": { grupo: "Administración", etiqueta: "Gestionar usuarios" },
  "sedes.gestionar": { grupo: "Administración", etiqueta: "Gestionar sedes" },
  "sedes.verTodas": { grupo: "Administración", etiqueta: "Trabajar con todas las sedes" },
  "configuracion.taller": { grupo: "Administración", etiqueta: "Configuración del taller y correo" },
} as const satisfies Record<string, { grupo: GrupoPermiso; etiqueta: string }>;

export type Permiso = keyof typeof PERMISOS;

const TODOS = Object.keys(PERMISOS) as Permiso[];

/** D2: nunca se dan a quien no sea ADMIN, ni por rol ni por excepción. */
export const PERMISOS_SOLO_ADMIN: readonly Permiso[] = [
  "usuarios.gestionar", "sedes.gestionar", "sedes.verTodas", "configuracion.taller",
];

const TECNICO: readonly Permiso[] = [
  "clientes.ver", "citas.ver", "cotizaciones.ver", "cotizaciones.editarItems",
  "ordenes.ver", "ordenes.verTodas", "ordenes.trabajar", "ordenes.cambiarEstado", "ordenes.anular", "ordenes.entregar",
  "facturas.ver", "inventario.ver", "inventario.costos", "compras.ver",
];

const RECEPCION: readonly Permiso[] = [
  ...TECNICO,
  "clientes.editar", "clientes.eliminar", "citas.gestionar", "cotizaciones.gestionar",
  "ordenes.crear", "ordenes.quitar", "ordenes.planificar", "vencimientos.avisar",
  "facturas.facturar", "mostrador.vender", "anticipos.registrar", "caja.usar", "cartera.ver",
  "cuentasPorPagar.usar", "gastos.registrar", "inventario.editar", "compras.gestionar",
  "importar.usar", "exportar.usar",
];

export const PERMISOS_POR_ROL: Record<Exclude<Role, "ADMIN">, readonly Permiso[]> = { TECNICO, RECEPCION };

export function esPermiso(valor: string): valor is Permiso {
  return Object.hasOwn(PERMISOS, valor);
}

export function permisosEfectivos(entrada: {
  role: Role;
  agregados?: readonly string[];
  quitados?: readonly string[];
}): Permiso[] {
  if (entrada.role === "ADMIN") return [...TODOS];
  return [...PERMISOS_POR_ROL[entrada.role]];
}

export function tienePermiso(permisos: readonly Permiso[], permiso: Permiso): boolean {
  return permisos.includes(permiso);
}
```

Después cambiar `export type Role = …` en `guards.ts:7` por `export type { Role } from "@/lib/auth/permisos";`, y en `next-auth.d.ts` usar `type TorqueFlowRole = import("@/lib/auth/permisos").Role;`. Reemplazar las uniones literales `"ADMIN" | "TECNICO" | "RECEPCION"` de `auth.ts:60`, `usuario-actions.ts:59,108` y `validation/usuario.ts:14` por `Role`, y el `z.enum([...])` de `validation/usuario.ts:3` por `z.enum(ROLES)`.

- [ ] **Step 4: Verificar**

Run: `npx vitest run --project unit src/lib/auth/permisos.test.ts`, después `npx tsc --noEmit --incremental false` y `npm test`.
Expected: PASS y el total de tests igual que antes más los nuevos.

- [ ] **Step 5: Commit**

```bash
git checkout -b fase26-permisos main
git add src/lib/auth/permisos.ts src/lib/auth/permisos.test.ts src/lib/auth/guards.ts src/types/next-auth.d.ts src/lib/validation/usuario.ts src/app/actions/usuario-actions.ts src/auth.ts
git commit -m "fase26-task 1: catálogo de permisos y tabla de roles con paridad de hoy"
git push -u origin fase26-permisos
```

---

### Task 2: `requirePermiso`, `puede` y página "Sin permiso"

**Files:**
- Modify: `src/lib/auth/guards.ts`
- Modify: `src/lib/auth/guards.test.ts`
- Modify: `src/types/next-auth.d.ts` (agregar `permisos: Permiso[]` a `Session.user`)
- Modify: `src/auth.ts` (en el callback `session`: `session.user.permisos = [];`)
- Create: `src/app/(dashboard)/sin-permiso/page.tsx`
- Create: `src/app/(dashboard)/sin-permiso/page.test.tsx`

**Interfaces:**
- Consumes: `permisosEfectivos`, `tienePermiso` y `Permiso` (tarea 1)
- Produces:
  - `requireSession(): Promise<Session>`: ahora también pone `session.user.role` (desde la base) y `session.user.permisos`
  - `puede(session: Session, permiso: Permiso): boolean`
  - `requirePermiso(permiso: Permiso): Promise<Session>`: si falta el permiso, hace `redirect("/sin-permiso")`
  - `requireRole` **no se toca** hasta la tarea 8

- [ ] **Step 1: Tests que fallan en `guards.test.ts`**

Cambiar el `mockResolvedValue` por defecto del `beforeEach` a `{ activo: true, role: "ADMIN" }` y agregar:

```ts
import { requireSession, requireRole, requirePermiso, puede } from "./guards";

describe("permisos en la sesión", () => {
  const base = { user: { id: "1", role: "ADMIN", tenantSlug: "t", tenantSchema: "taller_a", sedeActivaId: "sede-1" } };
  beforeEach(() => {
    mockAuth.mockReset().mockResolvedValue(structuredClone(base));
    mockGetTenantBySchema.mockReset().mockResolvedValue({ slug: "t", schemaName: "taller_a", estado: "ACTIVO" });
    mockRedirect.mockClear();
  });

  it("toma el rol de la base, no del JWT (D4)", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ activo: true, role: "TECNICO" });
    const session = await requireSession();
    expect(session.user.role).toBe("TECNICO");
    expect(puede(session, "ordenes.trabajar")).toBe(true);
    expect(puede(session, "caja.usar")).toBe(false);
  });

  it("consulta activo y role en la misma consulta", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ activo: true, role: "ADMIN" });
    await requireSession();
    expect(mockUsuarioFindUnique).toHaveBeenCalledWith({ where: { id: "1" }, select: { activo: true, role: true } });
  });

  it("requirePermiso devuelve la sesión si tiene el permiso", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ activo: true, role: "RECEPCION" });
    await expect(requirePermiso("caja.usar")).resolves.toMatchObject({ user: { role: "RECEPCION" } });
  });

  it("requirePermiso manda a /sin-permiso si le falta (D5)", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ activo: true, role: "TECNICO" });
    await expect(requirePermiso("caja.usar")).rejects.toThrow("REDIRECT:/sin-permiso");
  });
});
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run --project unit src/lib/auth/guards.test.ts`
Expected: FAIL, `requirePermiso` no está exportado.

- [ ] **Step 3: Implementar**

En `guards.ts`, dentro de `requireSession`, cambiar la consulta y llenar la sesión antes del chequeo de sede:

```ts
  const usuario = await tenantDb.usuario.findUnique({
    where: { id: session.user.id },
    select: { activo: true, role: true },
  });
  if (!usuario || !usuario.activo) {
    redirect("/login?error=usuario-suspendido");
  }
  // D4: el rol (y desde la tarea 13 las excepciones) se leen aquí en cada
  // petición, en la consulta que ya existía para `activo`: un cambio de
  // permisos aplica en la siguiente acción, sin esperar a que venza el JWT.
  session.user.role = usuario.role;
  session.user.permisos = permisosEfectivos({ role: usuario.role });
```

Y agregar al final:

```ts
export function puede(session: Session, permiso: Permiso): boolean {
  return tienePermiso(session.user.permisos, permiso);
}

export async function requirePermiso(permiso: Permiso): Promise<Session> {
  const session = await requireSession();
  if (!puede(session, permiso)) {
    redirect("/sin-permiso");
  }
  return session;
}
```

La página `sin-permiso/page.tsx` es un server component que llama a `requireSession()` y muestra la tarjeta "No tienes permiso para ver esto", el texto "Si lo necesitas, pídele al administrador del taller que te lo habilite." y un botón `Link` + `buttonVariants()` a `/` con el texto "Volver al inicio". Hay que seguir el patrón de enlaces de `7754e65`. El test renderiza la página con `requireSession` mockeado y revisa el título y el `href="/"`.

- [ ] **Step 4: Verificar.** Correr la tarea completa (`tsc`, `npm test`, `eslint`). Las pruebas que mockean `findUnique` con `{ activo: true }` y luego leen `session.user.role` tienen que actualizarse para incluir `role`.
- [ ] **Step 5: Commit** `fase26-task 2: requirePermiso, puede y página sin permiso`

---

### Tasks 3–6: Pasar las acciones a permisos (por módulo)

Las cuatro tareas siguen el mismo procedimiento. Lo que cambia es la lista de archivos.

**Procedimiento por archivo:**
1. En el test del archivo, cambiar el mock de guards:
   ```ts
   const mockRequirePermiso = vi.fn();
   vi.mock("@/lib/auth/guards", () => ({
     requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
     requireSession: () => mockRequireSession(),
     puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso),
   }));
   ```
   Las sesiones de prueba tienen que traer `permisos: [...]`. Cada `expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"])` pasa a `expect(mockRequirePermiso).toHaveBeenCalledWith("<permiso de la tabla>")`. **Primero el test** (verlo fallar), después el código.
2. En el archivo, cambiar `requireRole([...])` por `requirePermiso("…")` según la columna "Hoy lo exige" del catálogo, y borrar las constantes `ROLES_*` que queden sin uso.
3. Si un archivo tiene un chequeo que la tabla no cubre, **parar y reportar**. No hay que inventar permisos.

#### Task 3: Taller — clientes, vehículos, citas y cotizaciones
Archivos: `cliente-actions.ts`, `vehiculo-actions.ts`, `vehiculo-marca-modelo-actions.ts`, `cita-actions.ts`, `cotizacion-actions.ts`, `cotizacion-items-actions.ts`, `cotizacion-seguimiento-actions.ts`, `buscar-cotizacion-actions.ts` y `servicio-actions.ts` (solo `aplicarServicioACotizacionAction` → `cotizaciones.editarItems`), con sus `.test.ts`.
Commit: `fase26-task 3: acciones de clientes, citas y cotizaciones con permisos`

#### Task 4: Taller — órdenes, recepción y DVI
Archivos: `orden-actions.ts`, `item-orden-actions.ts`, `mano-de-obra-actions.ts`, `dvi-actions.ts`, `historial-actions.ts`, `recepcion-actions.ts` (ROLES_ORDEN → `ordenes.trabajar` salvo `entregarOrdenAction` → `ordenes.entregar`; ROLES_BORRAR → `ordenes.quitar`) y `servicio-actions.ts` (`aplicarServicioAOrdenAction` → `ordenes.trabajar`).
`asignarMecanicoAction`: entra con `ordenes.planificar`. La condición de `orden-actions.ts:508` pasa a `orden.mecanicoId && !puede(session, "ordenes.reasignarMecanico")`.
`updateEstadoOrdenAction`: entra con `ordenes.cambiarEstado`, sin chequeo nuevo de ANULADA (eso es de la tarea 11).
Commit: `fase26-task 4: acciones de órdenes, recepción y DVI con permisos`

#### Task 5: Dinero
Archivos: `factura-actions.ts` (crear → `facturas.facturar`; `listFacturas`, `getFactura` y `listOrdenesFacturables` pasan de `requireSession` a `requirePermiso("facturas.ver")`), `pago-actions.ts`, `venta-mostrador-actions.ts`, `devolucion-mostrador-actions.ts`, `anticipo-actions.ts`, `caja-actions.ts`, `cartera-actions.ts`, `cuenta-por-pagar-actions.ts`, `gasto-actions.ts`, `gasto-recurrente-actions.ts`, `categoria-gasto-actions.ts`, `lib/gastos/pendientes-db.ts` y `lib/gastos/validaciones-db.ts`.
Además:
- `lib/mostrador/cobro.ts`: `descuentoPermitido(sinTope: boolean, porcentaje: number, tope: number)`, que devuelve `sinTope || porcentaje <= tope`. Actualizar sus tests. En `venta-mostrador-actions.ts:170` el `if` pasa a `if (!puede(session, "mostrador.descuentoSinTope"))`.
- `lib/mostrador/plazo-devolucion.ts`: el parámetro `rol: string` pasa a `puedeConCajaCerrada: boolean`, y la línea 56 queda `if (cajaCerrada && !puedeConCajaCerrada)`. En `venta-mostrador-actions.ts:734,747,775,797` y `devolucion-mostrador-actions.ts:101` se pasa `puede(session, "mostrador.devolverConCajaCerrada")`. Hay que revisar también `components/editor-descuento.tsx` y `vender-mostrador.tsx`: si reciben el rol, pasan a recibir `tope: number | null` ya calculado por el servidor.
- `caja-actions.ts:246` y `gastos/validaciones-db.ts:9`: `role === "RECEPCION"` pasa a `!puede(session, "sedes.verTodas")`.
- `listCategoriasGasto`: `opciones.soloActivas ? "gastos.registrar" : "gastos.administrar"`.

Commit: `fase26-task 5: acciones de dinero con permisos`

#### Task 6: Inventario, administración y rutas
Archivos: `repuesto-actions.ts`, `bodega-actions.ts`, `proveedor-actions.ts`, `alertas-inventario-actions.ts`, `pedido-compra-actions.ts` (listas y `get*` pasan a `compras.ver`), `entrada-mercancia-actions.ts` (ídem), `servicio-actions.ts` (CRUD → `servicios.gestionar`; `listServicios`: `soloActivos ? "ordenes.ver" : "servicios.gestionar"`), `dvi-checklist-item-actions.ts`, `configuracion-taller-actions.ts`, `smtp-actions.ts`, `sede-actions.ts` (`listSedes` → `sedes.verTodas`, el resto → `sedes.gestionar`), `usuario-actions.ts`, `auditoria-actions.ts`, `reporte-actions.ts` (cada reporte con su permiso), `liquidacion-actions.ts`, `importacion-actions.ts` (`importar.usar`; la línea 473 pasa a `!puede(session, "servicios.gestionar")`), `api/exportar/[reporte]/route.ts` y `api/importacion/plantilla/route.ts`.
Commit: `fase26-task 6: acciones de inventario y administración con permisos`

---

### Task 7: Pantallas y menú con `puede()`

**Files:**
- Modify: las páginas que hoy leen `session.user.role`: `layout.tsx:127-160`, `page.tsx:139` (Inicio), `caja/page.tsx:31`, `cartera/page.tsx:18`, `gastos/page.tsx:33`, `importar/page.tsx:43`, `ordenes/page.tsx:302`, `ordenes/[id]/page.tsx:194-508`, `clientes/[id]/page.tsx:116-118`, `vehiculos/[id]/page.tsx:99`, `citas/[id]/page.tsx:180` y `vencimientos/page.tsx:18-20`
- Modify: las páginas con `requireRole` (`caja`, `cartera`, `gastos`, `gastos/configuracion`, `importar`, `liquidaciones`, `servicios` y `configuracion-smtp`): pasan a `requirePermiso` con el permiso de su sección
- Modify: `src/app/(dashboard)/dashboard-sidebar.tsx` y su test
- Test: los `.test.tsx` de esas páginas

**Interfaces:**
- Consumes: `puede`, `requirePermiso` y `tienePermiso`
- Produces: `DashboardSidebar` recibe `permisos: Permiso[]` en lugar de `esAdmin`, `puedeVerFinanzas` y `puedeImportar`. Cada `NavItem` lleva `permiso?: Permiso`, y el menú filtra con `tienePermiso`. Un grupo sin ítems no se pinta.

Mapa de props de hoy a permisos:
- `esAdmin` usado para `listSedes()` → `puede(session, "sedes.verTodas")`
- `esAdmin` de diálogos de vehículo y de NuevaOrdenDialog → `vehiculos.catalogo` (renombrar la prop a `puedeAgregarCatalogo`)
- `esAdmin` de gastos (botones de editar y recurrentes) → `gastos.administrar`
- `esAdmin` de importar → `servicios.gestionar`
- `puedeQuitar` y `puedeCrearRepuesto` → `ordenes.quitar` / `inventario.editar`
- `puedeGestionarAnticipos` → `anticipos.registrar`
- botón de mecánico (línea ~272) → `puede(…"ordenes.reasignarMecanico") || (puede(…"ordenes.planificar") && !orden.mecanico)`
- `mostrarVencimientos` y `puedeAvisar` → `vencimientos.avisar`; `puedeConfigurar` → `configuracion.taller`
- menú: Mostrador → `mostrador.vender`, Caja → `caja.usar`, Cartera → `cartera.ver`, Cuentas por pagar → `cuentasPorPagar.usar`, Gastos → `gastos.registrar`, Facturas → `facturas.ver`, Servicios → `servicios.gestionar`, Importar → `importar.usar`, Reportes → `reportes.productividad`, Liquidaciones → `liquidaciones.gestionar`, Sedes → `sedes.gestionar`, Usuarios → `usuarios.gestionar`, Auditoría → `auditoria.ver`, SMTP → `configuracion.taller`. Clientes, Cotizaciones, Órdenes, Citas, Vencimientos e Inventario quedan sin permiso en esta tarea, como hoy.

- [ ] **Step 1:** En el test del sidebar, renderizar con `permisos = permisosEfectivos({ role: "TECNICO" })` y verificar que **no** aparezcan Mostrador, Caja ni Usuarios y que **sí** aparezca Facturas, igual que hoy. Lo mismo con RECEPCION (aparece Importar, no aparece Usuarios) y con ADMIN (aparece todo). Verlo fallar.
- [ ] **Step 2:** Implementar el menú y las páginas. Los tests de páginas existentes deben seguir pasando cambiando solo el mock de sesión (agregar `permisos`).
- [ ] **Step 3:** Verificar y hacer commit: `fase26-task 7: pantallas y menú preguntan por permisos`

---

### Task 8: Quitar `requireRole` y candado contra regresiones

**Files:**
- Modify: `src/lib/auth/guards.ts` (borrar `requireRole`) y `guards.test.ts` (borrar su `describe`)
- Create: `src/lib/auth/arquitectura-permisos.test.ts`

- [ ] **Step 1: Test de arquitectura** (falla mientras quede algún uso):

```ts
// src/lib/auth/arquitectura-permisos.test.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");
// lib/auth decide con el rol (D9); auth.ts lo copia del JWT.
const PERMITIDOS = [join("lib", "auth") + sep, "auth.ts"];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (nombre === "generated" || nombre === "node_modules") return [];
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

describe("los permisos se piden por nombre, no por rol", () => {
  const fuera = archivos(SRC).filter((ruta) => !PERMITIDOS.some((p) => relative(SRC, ruta).startsWith(p)));

  it("nadie usa requireRole", () => {
    expect(fuera.filter((ruta) => readFileSync(ruta, "utf8").includes("requireRole("))).toEqual([]);
  });

  it("nadie decide con session.user.role", () => {
    expect(fuera.filter((ruta) => /session\.user\.role\b/.test(readFileSync(ruta, "utf8")))).toEqual([]);
  });
});
```

- [ ] **Step 2:** Correrlo. Si aparece algún archivo, pasarlo a permisos con la tabla (o parar y reportar si no está en la tabla). Después borrar `requireRole`.
- [ ] **Step 3:** Verificación completa y `npm run build`. Commit: `fase26-task 8: sin requireRole y candado contra decidir por rol`

---

## Bloque B — Tapar huecos y Jefe de taller

### Task 9: Bloqueo real de las URLs

**Files:**
- Modify: todo `page.tsx` bajo `src/app/(dashboard)` que hoy solo llame a `requireSession` o a nada (la lista sale de `grep -rL "requirePermiso" "src/app/(dashboard)" --include=page.tsx`)
- Create: `src/app/(dashboard)/paginas-con-permiso.test.ts`

Permiso de cada página: `/clientes*` y `/vehiculos/[id]` → `clientes.ver`; `/citas*` → `citas.ver`; `/cotizaciones*` → `cotizaciones.ver`; `/ordenes*` → `ordenes.ver`; `/vencimientos` → `clientes.ver`; `/facturas*` → `facturas.ver`; `/mostrador` → `mostrador.vender`; `/cuentas-por-pagar` → `cuentasPorPagar.usar`; `/repuestos*`, `/bodegas*` y `/proveedores` → `inventario.ver`; `/pedidos-compra*` y `/entradas-mercancia*` → `compras.ver`; `/reportes` → `reportes.productividad`; `/auditoria` → `auditoria.ver`; `/sedes` → `sedes.gestionar`; `/usuarios*` → `usuarios.gestionar`. Sin permiso quedan solo `/` (Inicio) y `/sin-permiso`.

- [ ] **Step 1:** El test recorre los `page.tsx` de `(dashboard)` y falla si alguno, fuera de `page.tsx` raíz y `sin-permiso/page.tsx`, no contiene `requirePermiso(`. Verlo fallar.
- [ ] **Step 2:** Poner `const session = await requirePermiso("…")` al principio de cada página, antes de cualquier `Promise.all`. Como `redirect` lanza, un `Promise.all` con la llamada adentro se cortaría a la mitad. Ver el comentario de `reportes/page.tsx:88`.
- [ ] **Step 3:** En `/reportes`: llamar a `getReporteRentabilidad` solo si `puede(session, "reportes.rentabilidad")` y ocultar esa sección si no. Test: con solo `reportes.productividad`, la página no llama a rentabilidad.
- [ ] **Step 4:** Verificar y hacer commit: `fase26-task 9: cada página exige su permiso`

---

### Task 10: El técnico ve solo sus órdenes (D7)

**Files:**
- Modify: `src/lib/sede/scope.ts` (+ test)
- Modify: `src/app/actions/orden-actions.ts` (`listOrdenes`, `listOrdenesByVehiculo`, `getOrden`) y todas las acciones con `ordenes.trabajar`, `ordenes.cambiarEstado` u `ordenes.entregar` que buscan la orden por id: `item-orden`, `mano-de-obra`, `dvi`, `historial`, `recepcion`, `servicio` (aplicar a orden) y `orden-actions` (`updateEstadoOrdenAction`)
- Modify: los conteos del layout y del Inicio que cuentan órdenes (`loadOrdenesEnTaller`, `getDashboardOverview` y `getAlertasTaller`)

**Interfaces:**
- Produces: `scopeOrdenVisible(session: Session): Prisma.OrdenTrabajoWhereInput`, que devuelve `scopeOrden(sede)` si `puede(session, "ordenes.verTodas")`, y si no:
  ```ts
  { ...scopeOrden(session.user.sedeActivaId),
    OR: [{ mecanicoId: session.user.id }, { manoDeObra: { some: { mecanicoId: session.user.id } } }] }
  ```
  Antes de escribirlo, confirmar en `schema.prisma` el nombre exacto de la relación de `OrdenTrabajo` hacia `ManoDeObra`.

- [ ] **Step 1:** Tests de `scopeOrdenVisible` (con y sin `ordenes.verTodas`), y en `orden-actions.test.ts` que `getOrden` use el `where` acotado para una sesión sin `ordenes.verTodas`. Para las acciones de escritura: con una sesión de técnico y una orden ajena, `findFirst` devuelve `null` y la acción no escribe. Verlo fallar.
- [ ] **Step 2:** Implementar y reemplazar `scopeOrden(...)` por `scopeOrdenVisible(session)` **solo** en la búsqueda de la orden en esas acciones. El resto de los 37 usos son de otros módulos y no se tocan.
- [ ] **Step 3:** Quitar `"ordenes.verTodas"` de la lista `TECNICO` en `permisos.ts` y mover ese caso del test de paridad a un `describe("cambios del bloque B")`.
- [ ] **Step 4:** Verificar y hacer commit: `fase26-task 10: el técnico ve solo las órdenes donde trabaja`

---

### Task 11: Lo que el técnico deja de poder (D8)

**Files:**
- Modify: `src/lib/auth/permisos.ts` y su test (sacar `ordenes.anular`, `facturas.ver`, `inventario.costos` y `compras.ver` de `TECNICO`)
- Modify: `src/app/actions/orden-actions.ts` (`updateEstadoOrdenAction`) y su test
- Modify: `src/app/(dashboard)/repuestos/page.tsx`, `repuestos/[id]` si existe, y la ficha de la orden donde se use `listRepuestoOptions`
- Modify: `src/app/actions/repuesto-actions.ts` (`listRepuestoOptions`)

- [ ] **Step 1: Tests que fallan:**
  - `updateEstadoOrdenAction` con estado `ANULADA` y una sesión sin `ordenes.anular` devuelve `{ success: false, error: "No tienes permiso para anular órdenes" }` y no escribe. El formato de error se copia de las otras acciones del archivo.
  - Repuestos con una sesión sin `inventario.costos`: no aparecen la columna de precio de compra, el margen ni el KPI de valor del inventario, y **los objetos que se pasan a componentes de cliente no traen `precioCompra`**. El payload de RSC lo serializaría aunque no se pinte.
  - `listRepuestoOptions` sin `inventario.costos` no incluye `precioCompra`.
- [ ] **Step 2:** Implementar. En `updateEstadoOrdenAction`, después de validar el estado: `if (parsedEstado.data === "ANULADA" && !puede(session, "ordenes.anular"))`.
- [ ] **Step 3:** Cambiar la lista `TECNICO` de `permisos.ts` y los tests de paridad.
- [ ] **Step 4:** Verificar y hacer commit: `fase26-task 11: el técnico no anula ni ve costos, facturas ni compras`

---

### Task 12: Rol Jefe de taller (D6)

**Files:**
- Modify: `prisma/tenant/schema.prisma` (`enum Role` + `JEFE_TALLER`)
- Create: `prisma/tenant/migrations/20261023120000_rol_jefe_taller/migration.sql`
- Modify: `src/lib/auth/permisos.ts` (+ test), `src/app/(dashboard)/usuarios/page.tsx` (etiqueta, color y punto del rol), `usuarios/nuevo/nuevo-usuario-form.tsx` y `usuarios/[id]/editar-usuario-form.tsx` (opción del select)
- Modify: los 7 filtros `role: "TECNICO"` de mecánicos: `orden-actions.ts:137,517`, `mano-de-obra-actions.ts:53`, `servicio-actions.ts:144` y `liquidacion-actions.ts:143,251,573`

**Interfaces:**
- Produces: `ROLES_MECANICO: readonly Role[] = ["TECNICO", "JEFE_TALLER"]` en `permisos.ts`. Los filtros pasan a `role: { in: [...ROLES_MECANICO] }`.

- [ ] **Step 1: Migración.**
  ```sql
  -- AlterEnum
  ALTER TYPE "Role" ADD VALUE 'JEFE_TALLER';
  ```
  Agregar `JEFE_TALLER` al enum de `schema.prisma`, correr `npx prisma generate --schema prisma/tenant/schema.prisma` y el `migrate diff` contra el **schema prisma del repo** (no aplicar a la base).
- [ ] **Step 2: Tests que fallan:** en `permisos.test.ts`, que `JEFE_TALLER` tenga exactamente la columna **J** del catálogo (lista explícita en el test), que no tenga nada de "Dinero" ni ★, y que `listTecnicos` (en `orden-actions.test.ts`) filtre por `{ in: ["TECNICO", "JEFE_TALLER"] }`.
- [ ] **Step 3: Implementar.**
  ```ts
  export const ROLES = ["ADMIN", "JEFE_TALLER", "TECNICO", "RECEPCION"] as const;
  export const ROLES_MECANICO: readonly Role[] = ["TECNICO", "JEFE_TALLER"];

  const JEFE_TALLER: readonly Permiso[] = [
    "clientes.ver", "clientes.editar", "vehiculos.catalogo", "vencimientos.avisar",
    "citas.ver", "citas.gestionar", "citas.eliminar",
    "cotizaciones.ver", "cotizaciones.gestionar", "cotizaciones.editarItems",
    "ordenes.ver", "ordenes.verTodas", "ordenes.crear", "ordenes.trabajar", "ordenes.quitar",
    "ordenes.cambiarEstado", "ordenes.anular", "ordenes.entregar", "ordenes.planificar", "ordenes.reasignarMecanico",
    "inventario.ver", "inventario.editar", "inventario.costos", "compras.ver", "compras.gestionar",
    "servicios.gestionar", "reportes.productividad",
  ];
  ```
  Etiqueta en la UI: "Jefe de taller". El color sale de `KPI_TONE`, sin repetir el de otro rol: hay que mirar `ROLE_BADGE_CLASSNAME` y `ROLE_DOT_COLOR` en `usuarios/page.tsx`. Las reglas de sedes de `validation/usuario.ts` ya tratan a todo rol que no sea ADMIN igual, así que no cambian; agregar un test que lo confirme para JEFE_TALLER.
- [ ] **Step 4:** Verificar y hacer commit: `fase26-task 12: rol jefe de taller`

---

## Bloque C — Excepciones por usuario

### Task 13: Modelo y cálculo con excepciones

**Files:**
- Modify: `prisma/tenant/schema.prisma` (modelo `Usuario`)
- Create: `prisma/tenant/migrations/20261024120000_permisos_usuario/migration.sql`
- Modify: `src/lib/auth/permisos.ts` (+ test) y `src/lib/auth/guards.ts` (+ test)

- [ ] **Step 1: Migración.**
  ```prisma
  permisosAgregados String[] @default([]) @map("permisos_agregados")
  permisosQuitados  String[] @default([]) @map("permisos_quitados")
  ```
  ```sql
  -- AlterTable
  ALTER TABLE "usuarios" ADD COLUMN "permisos_agregados" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "permisos_quitados" TEXT[] DEFAULT ARRAY[]::TEXT[];
  ```
  Correr `prisma generate` y `migrate diff` (vacío).
- [ ] **Step 2: Tests que fallan** en `permisos.test.ts`:
  ```ts
  describe("excepciones por usuario (D1–D3)", () => {
    it("suma los agregados y resta los quitados", () => {
      const p = permisosEfectivos({ role: "TECNICO", agregados: ["mostrador.vender"], quitados: ["ordenes.entregar"] });
      expect(p).toContain("mostrador.vender");
      expect(p).not.toContain("ordenes.entregar");
    });
    it("ignora claves desconocidas", () => {
      expect(permisosEfectivos({ role: "TECNICO", agregados: ["ordenes.volar"] })).toEqual(permisosEfectivos({ role: "TECNICO" }));
    });
    it("nunca da un permiso ★ por excepción", () => {
      expect(permisosEfectivos({ role: "RECEPCION", agregados: ["usuarios.gestionar"] })).not.toContain("usuarios.gestionar");
    });
    it("ADMIN ignora las excepciones", () => {
      expect(permisosEfectivos({ role: "ADMIN", quitados: ["caja.usar"] })).toContain("caja.usar");
    });
  });
  ```
  En `guards.test.ts`: `select` incluye `permisosAgregados: true, permisosQuitados: true`, y un TECNICO con `permisosAgregados: ["caja.usar"]` pasa `requirePermiso("caja.usar")`.
- [ ] **Step 3: Implementar** `permisosEfectivos`:
  ```ts
  if (entrada.role === "ADMIN") return [...TODOS];
  const quitados = new Set(entrada.quitados ?? []);
  const agregados = (entrada.agregados ?? []).filter(
    (valor): valor is Permiso => esPermiso(valor) && !PERMISOS_SOLO_ADMIN.includes(valor),
  );
  return [...new Set([...PERMISOS_POR_ROL[entrada.role], ...agregados])].filter((p) => !quitados.has(p));
  ```
  En `guards.ts`, la consulta y la llamada pasan a usar `permisosAgregados` y `permisosQuitados`.
- [ ] **Step 4:** Verificar y hacer commit: `fase26-task 13: excepciones de permisos por usuario en la sesión`

---

### Task 14: Acción para guardar las excepciones

**Files:**
- Create: `src/lib/validation/permisos-usuario.ts` (+ test)
- Modify: `src/app/actions/usuario-actions.ts` (+ test)

**Interfaces:**
- Produces: `guardarPermisosUsuarioAction(usuarioId: string, permisos: string[]): Promise<ResultadoAccion>`. `permisos` es la lista **marcada** en pantalla. La acción calcula `agregados = marcados − rol` y `quitados = rol − marcados`, y guarda solo esa diferencia. Así, si después cambia la tabla del rol, el usuario la hereda.
- Produces: `excepcionesDesdeMarcados(role: Role, marcados: readonly Permiso[]): { agregados: Permiso[]; quitados: Permiso[] }` en `permisos.ts`

- [ ] **Step 1: Tests que fallan:**
  - `excepcionesDesdeMarcados("TECNICO", [...permisos de TECNICO, "caja.usar"])` → `{ agregados: ["caja.usar"], quitados: [] }`
  - La validación rechaza claves desconocidas y ★, con el mensaje "Ese permiso no se puede dar a este usuario".
  - La acción exige `usuarios.gestionar`, rechaza a un usuario ADMIN ("El administrador siempre tiene todos los permisos"), rechaza a un usuario de otro taller (`findUnique` → `null`) y escribe `AuditLog` con `tipo: "USUARIO_ACTUALIZAR_PERMISOS"` y `detalle: { agregados, quitados, antes: { agregados, quitados } }`. El patrón de auditoría se copia de `updateUsuarioAction` (`usuario-actions.ts:340-360`).
  - "Volver al rol base" equivale a enviar exactamente los permisos del rol, lo que deja ambas listas vacías.
- [ ] **Step 2:** Implementar y llamar a `revalidatePath("/usuarios")` y a `revalidatePath(\`/usuarios/${usuarioId}\`)`.
- [ ] **Step 3:** En `updateUsuarioAction`, al **cambiar el rol**, vaciar las dos listas. Las excepciones eran relativas al rol anterior. Test incluido.
- [ ] **Step 4:** Verificar y hacer commit: `fase26-task 14: guardar permisos por usuario con auditoría`

---

### Task 15: Pantalla de permisos del usuario

**Files:**
- Create: `src/app/(dashboard)/usuarios/[id]/permisos-usuario.tsx` (cliente) + `.test.tsx`
- Modify: `src/app/(dashboard)/usuarios/[id]/page.tsx` (sección "Permisos" debajo del formulario; no se muestra si el usuario es ADMIN, y en su lugar va el texto "El administrador tiene todos los permisos")
- Modify: `src/app/(dashboard)/usuarios/page.tsx` (al lado del rol, "· N cambios" cuando `agregados + quitados > 0`) y `listUsuariosConSedes` / `listUsuariosConMetricas` (traer las dos listas)

**Interfaces:**
- Consumes: `PERMISOS`, `GRUPOS_PERMISO`, `PERMISOS_SOLO_ADMIN`, `permisosEfectivos({ role })` (los permisos del rol base, para marcar "Agregado"/"Quitado") y `guardarPermisosUsuarioAction`

Comportamiento:
- Casillas agrupadas por `GRUPOS_PERMISO`, cada una con su `etiqueta`. Los ★ no aparecen.
- Un permiso marcado que el rol no trae lleva la etiqueta pequeña "Agregado". Uno que el rol trae y está desmarcado lleva "Quitado". Los colores salen de `KPI_TONE` (preferencias de UI del usuario).
- Botones: "Guardar permisos" y "Volver al rol base". Este último usa `ConfirmacionEnLinea` porque borra cambios.
- Toast de éxito o de error con el `ResultadoAccion`.

- [ ] **Step 1:** Tests que fallan: renderiza un TECNICO con `agregados: ["caja.usar"]` y verifica que "Abrir y cerrar caja" esté marcada con "Agregado"; al desmarcar "Entregar el vehículo" aparece "Quitado"; "Guardar" llama a la acción con la lista marcada; no aparece "Gestionar usuarios".
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** Verificar (más `npm run build`) y hacer commit: `fase26-task 15: pantalla de permisos en la ficha del usuario`

---

### Task 16: Revisión independiente y arreglos

- [ ] Revisión del diff completo `main...fase26-permisos` por otro modelo, en solo lectura, con `superpowers:requesting-code-review`. Foco: acciones que se hayan quedado sin permiso, que la paridad del bloque A se respete, fuga de `precioCompra` en props de cliente, IDOR de órdenes del técnico y permisos ★.
- [ ] Ronda de arreglos con test por hallazgo. Commits `fase26-fix: …`.

### Task 17: Cierre (solo con aprobación explícita del usuario)

- [ ] Verificación final: `npx tsc --noEmit --incremental false`, `npm test`, `npx eslint` y `npm run build`.
- [ ] Revisión manual: lanzar `npm run dev` en background y pedirle al usuario que entre como TECNICO, RECEPCION y un JEFE_TALLER de prueba, y que pruebe una excepción.
- [ ] Respaldo `pg_dump` de `taller_dev` y `taller_dev_reference`, y aplicar las migraciones `20261023120000_rol_jefe_taller` y `20261024120000_permisos_usuario` a los dos schemas. `migrate diff` tiene que responder "This is an empty migration".
- [ ] `git merge --no-ff fase26-permisos` a `main`, actualizar `PROJECT_BRIEF.md` y `docs/TRASPASO-AGENTES.md`, y hacer push.

## Seguridad (lo que revisa la tarea 16)

- Ninguna acción exportada en `src/app/actions` queda sin `requirePermiso` o `requireSession`. El test de la tarea 8 cubre `requireRole`, y la revisión cubre las que faltan.
- Las excepciones solo las escribe `guardarPermisosUsuarioAction` (requiere `usuarios.gestionar`). El cliente nunca manda permisos efectivos: el servidor los calcula siempre.
- Los ★ no se pueden conceder: los filtra `permisosEfectivos` y los rechaza la validación (doble barrera).
- El técnico solo lee y escribe órdenes propias (`scopeOrdenVisible` en lecturas **y** en escrituras por id).
