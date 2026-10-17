import { describe, expect, it } from "vitest";
import { PERMISOS, PERMISOS_POR_ROL, PERMISOS_SOLO_ADMIN, ROLES, ROLES_MECANICO, esPermiso, permisosEfectivos, tienePermiso, type Permiso } from "./permisos";

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
    "ordenes.trabajar", "ordenes.cambiarEstado", "ordenes.entregar", "inventario.ver",
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

describe("cambios del bloque B", () => {
  it("TECNICO ya no ve todas las órdenes de la sede (D7) y RECEPCION sí", () => {
    expect(tienePermiso(permisosEfectivos({ role: "TECNICO" }), "ordenes.verTodas")).toBe(false);
    expect(tienePermiso(permisosEfectivos({ role: "RECEPCION" }), "ordenes.verTodas")).toBe(true);
  });

  it.each<Permiso>(["ordenes.anular", "facturas.ver", "inventario.costos", "compras.ver"])(
    "TECNICO pierde %s (D8) y RECEPCION lo conserva",
    (permiso) => {
      expect(tienePermiso(permisosEfectivos({ role: "TECNICO" }), permiso)).toBe(false);
      expect(tienePermiso(permisosEfectivos({ role: "RECEPCION" }), permiso)).toBe(true);
    },
  );
});

describe("rol JEFE_TALLER (D6)", () => {
  const JEFE_ESPERADO: Permiso[] = [
    "clientes.ver", "clientes.editar", "vehiculos.catalogo", "vencimientos.avisar",
    "citas.ver", "citas.gestionar", "citas.eliminar",
    "cotizaciones.ver", "cotizaciones.gestionar", "cotizaciones.editarItems",
    "ordenes.ver", "ordenes.verTodas", "ordenes.crear", "ordenes.trabajar", "ordenes.quitar",
    "ordenes.cambiarEstado", "ordenes.anular", "ordenes.entregar", "ordenes.planificar", "ordenes.reasignarMecanico",
    "inventario.ver", "inventario.editar", "inventario.costos", "compras.ver", "compras.gestionar",
    "servicios.gestionar", "reportes.productividad",
  ];

  it("tiene exactamente la columna J del catálogo", () => {
    expect([...permisosEfectivos({ role: "JEFE_TALLER" })].sort()).toEqual([...JEFE_ESPERADO].sort());
  });

  it("no tiene nada de Dinero ni permisos ★", () => {
    const jefe = permisosEfectivos({ role: "JEFE_TALLER" });
    for (const permiso of jefe) {
      expect(PERMISOS[permiso].grupo).not.toBe("Dinero");
      expect(PERMISOS_SOLO_ADMIN).not.toContain(permiso);
    }
  });

  it("ROLES incluye JEFE_TALLER y ROLES_MECANICO son técnico y jefe de taller", () => {
    expect(ROLES).toContain("JEFE_TALLER");
    expect([...ROLES_MECANICO]).toEqual(["TECNICO", "JEFE_TALLER"]);
  });
});

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
