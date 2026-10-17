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
