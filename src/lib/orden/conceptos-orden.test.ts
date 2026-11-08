import { describe, expect, it } from "vitest";
import { conceptosDesdeOrden, idConceptoOrden, leerIdConceptoOrden } from "./conceptos-orden";

const item = {
  id: "i1",
  repuestoId: "r1",
  descripcion: "Filtro",
  cantidad: 2,
  precioUnitario: "1000",
  ivaPct: "5.00",
  grupoKitId: null,
  grupoKitNombre: null,
  createdAt: new Date("2026-11-08T10:00:00Z"),
  repuesto: { codigo: "F-1", precioVenta: "1200", stockActual: 3 },
};
const mano = {
  id: "m1",
  descripcion: "Cambio",
  valor: "50000",
  ivaPct: "0",
  grupoKitId: null,
  grupoKitNombre: null,
  createdAt: new Date("2026-11-08T09:00:00Z"),
  mecanico: { id: "t1", nombre: "Carlos" },
};

describe("conceptosDesdeOrden", () => {
  it("une las dos tablas por fecha, con ids prefijados", () => {
    const conceptos = conceptosDesdeOrden([item], [mano]);
    expect(conceptos.map((concepto) => concepto.id)).toEqual(["mo:m1", "item:i1"]);
    expect(conceptos[1]).toMatchObject({
      tipo: "REPUESTO",
      cantidad: 2,
      precioUnitario: 1000,
      ivaPct: 5,
      codigo: "F-1",
      precioCatalogo: 1200,
      stockActual: 3,
      editableCantidad: true,
      mecanico: null,
    });
  });

  it("la mano de obra no tiene cantidad editable y su precio es el valor", () => {
    const [linea] = conceptosDesdeOrden([], [mano]);
    expect(linea).toMatchObject({
      tipo: "MANO_OBRA",
      cantidad: 1,
      precioUnitario: 50000,
      ivaPct: 0,
      repuestoId: null,
      precioCatalogo: null,
      stockActual: null,
      editableCantidad: false,
      mecanico: { id: "t1", nombre: "Carlos" },
    });
  });

  it("un ítem manual (sin repuesto) no trae precio de catálogo ni existencia", () => {
    const [manual] = conceptosDesdeOrden([{ ...item, repuestoId: null, repuesto: null }], []);
    expect(manual).toMatchObject({ codigo: null, precioCatalogo: null, stockActual: null });
  });
});

describe("ids de la orden", () => {
  it("van y vuelven, y rechazan lo que no tiene prefijo", () => {
    expect(leerIdConceptoOrden(idConceptoOrden("mo", "m1"))).toEqual({ tabla: "mo", id: "m1" });
    expect(leerIdConceptoOrden("item:i1")).toEqual({ tabla: "item", id: "i1" });
    expect(leerIdConceptoOrden("i1")).toBeNull();
    expect(leerIdConceptoOrden("otro:i1")).toBeNull();
    expect(leerIdConceptoOrden("item:")).toBeNull();
  });
});
