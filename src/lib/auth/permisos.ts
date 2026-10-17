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
