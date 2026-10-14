import { beforeEach, describe, expect, it, vi } from "vitest";
import { escribirLibro } from "@/lib/importacion/xlsx";
import { resultadoVacio } from "@/lib/importacion/resultado";
import { MAX_BYTES_ARCHIVO } from "@/lib/importacion/hojas";
import { armarZip } from "@/lib/importacion/test-utils";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...args: unknown[]) => mockRequireRole(...args) }));

const tx = {
  cliente: { create: vi.fn() },
  vehiculo: { create: vi.fn() },
  repuesto: { create: vi.fn(), update: vi.fn() },
  entradaMercancia: { create: vi.fn() },
  entradaMercanciaItem: { create: vi.fn() },
  servicio: { create: vi.fn() },
};

const mockTxOpciones = vi.fn();
const db = {
  cliente: { findMany: vi.fn() },
  vehiculo: { findMany: vi.fn() },
  repuesto: { findMany: vi.fn() },
  servicio: { findMany: vi.fn() },
  bodega: { findFirst: vi.fn() },
  proveedor: { findFirst: vi.fn() },
  $transaction: (fn: (cliente: typeof tx) => unknown, opciones?: unknown) => {
    mockTxOpciones(opciones);
    return fn(tx);
  },
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { importarAction } from "./importacion-actions";

const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller", sedeActivaId: "sede-1" } };
const RECEPCION = { user: { id: "u2", role: "RECEPCION", tenantSchema: "taller", sedeActivaId: "sede-1" } };

const CABECERAS_CLIENTES = ["Nombre", "Documento", "Teléfono", "Correo"];
const CABECERAS_VEHICULOS = ["Placa", "Marca", "Modelo", "Documento cliente"];
const CABECERAS_VEHICULOS_CON_NOMBRE = ["Placa", "Marca", "Modelo", "Documento cliente", "Nombre cliente"];
const CABECERAS_REPUESTOS = ["Código", "Nombre", "Precio compra", "Precio venta", "Cantidad inicial"];
const CABECERAS_SERVICIOS = ["Nombre", "Precio mano de obra"];

async function archivo(hojas: { nombre: string; filas: unknown[][] }[]): Promise<File> {
  const bytes = await escribirLibro(hojas.map((hoja) => ({ nombre: hoja.nombre, filas: hoja.filas as never })));
  return new File([new Uint8Array(bytes)], "importacion.xlsx");
}

function enviar(archivoSubido?: File, extra: Record<string, string> = {}): FormData {
  const formData = new FormData();
  if (archivoSubido) formData.set("archivo", archivoSubido);
  for (const [clave, valor] of Object.entries(extra)) formData.set(clave, valor);
  return formData;
}

const resumenDe = (resultado: Awaited<ReturnType<typeof importarAction>>, hoja: string) =>
  resultado.resumen.find((fila) => fila.hoja === hoja);

describe("importarAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(ADMIN);
    db.cliente.findMany.mockResolvedValue([]);
    db.vehiculo.findMany.mockResolvedValue([]);
    db.repuesto.findMany.mockResolvedValue([]);
    db.servicio.findMany.mockResolvedValue([]);
    db.bodega.findFirst.mockResolvedValue({ id: "b1" });
    db.proveedor.findFirst.mockResolvedValue({ id: "p1" });
    tx.cliente.create.mockImplementation(({ data }: { data: { nombre: string; documento: string | null } }) =>
      Promise.resolve({ id: `c-${data.nombre}`, nombre: data.nombre, documento: data.documento }),
    );
    tx.vehiculo.create.mockResolvedValue({ id: "v1" });
    tx.repuesto.create.mockResolvedValue({ id: "r1" });
    tx.repuesto.update.mockResolvedValue({});
    tx.entradaMercancia.create.mockResolvedValue({ id: "e1" });
    tx.entradaMercanciaItem.create.mockResolvedValue({});
    tx.servicio.create.mockResolvedValue({ id: "s1" });
  });

  it("exige ADMIN o RECEPCION", async () => {
    await importarAction(resultadoVacio(), enviar());

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
  });

  it("exige un archivo .xlsx que no pese más de 5 MB", async () => {
    expect(await importarAction(resultadoVacio(), enviar())).toEqual(
      resultadoVacio("Selecciona el archivo de Excel (.xlsx) que quieres importar"),
    );

    const otro = new File([new Uint8Array([1, 2, 3])], "datos.csv");
    expect((await importarAction(resultadoVacio(), enviar(otro))).error).toContain(".xlsx");

    const enorme = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "grande.xlsx");
    expect((await importarAction(resultadoVacio(), enviar(enorme))).error).toContain("5 MB");
  });

  it("avisa si no hay ninguna hoja esperada y si el archivo no se puede leer", async () => {
    const raro = await archivo([{ nombre: "Otra cosa", filas: [["x"]] }]);
    expect((await importarAction(resultadoVacio(), enviar(raro))).error).toContain("No encontramos ninguna de las hojas");

    const basura = new File([new Uint8Array(Buffer.from("no soy un xlsx"))], "roto.xlsx");
    expect((await importarAction(resultadoVacio(), enviar(basura))).error).toContain("No pudimos leer el archivo");
  });

  it("rechaza una bomba zip antes de que la librería de Excel la descomprima (hallazgo M4)", async () => {
    // Pocos KB que se expanden a 41 MB: por debajo del tope de 5 MB del archivo.
    const bomba = armarZip([{ nombre: "xl/worksheets/sheet1.xml", datos: Buffer.alloc(41 * 1024 * 1024) }]);
    expect(bomba.length).toBeLessThan(MAX_BYTES_ARCHIVO);

    const resultado = await importarAction(
      resultadoVacio(),
      enviar(new File([new Uint8Array(bomba)], "bomba.xlsx")),
    );

    expect(resultado.error).toBe(
      "El archivo ocupa más de 40 MB al abrirlo: divídelo en varios archivos más pequeños",
    );
    expect(db.cliente.findMany).not.toHaveBeenCalled();
  });

  it("crea los clientes nuevos y omite los que ya existen, sin tocarlos", async () => {
    db.cliente.findMany.mockResolvedValue([{ id: "c0", nombre: "Ana", documento: "1" }]);
    const libro = await archivo([
      {
        nombre: "Clientes",
        filas: [CABECERAS_CLIENTES, ["Ana", "1", "", ""], ["Beto", "2", "300", "beto@correo.com"]],
      },
    ]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro));

    expect(resultado.error).toBeNull();
    expect(tx.cliente.create).toHaveBeenCalledTimes(1);
    expect(tx.cliente.create).toHaveBeenCalledWith({
      data: { nombre: "Beto", telefono: "300", email: "beto@correo.com", documento: "2" },
      select: { id: true, nombre: true, documento: true },
    });
    expect(resumenDe(resultado, "Clientes")).toEqual({
      hoja: "Clientes",
      leidas: 2,
      creadas: 1,
      existentes: 1,
      rechazadas: 0,
      estado: "ok",
      motivo: null,
    });
    expect(resultado.filas).toEqual([
      {
        hoja: "Clientes",
        fila: 2,
        columna: null,
        valor: "documento 1",
        motivo: "Ya existe en el sistema",
        tipo: "ya_existia",
      },
    ]);
  });

  it("resuelve los vehículos con los clientes creados en la misma importación", async () => {
    const libro = await archivo([
      { nombre: "Clientes", filas: [CABECERAS_CLIENTES, ["Ana", "1", "", ""]] },
      {
        nombre: "Vehículos",
        filas: [CABECERAS_VEHICULOS, ["ABC123", "Renault", "Logan", "1"]],
      },
    ]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro));

    expect(tx.vehiculo.create).toHaveBeenCalledTimes(1);
    expect(tx.vehiculo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ placa: "ABC123", clienteId: "c-Ana" }) }),
    );
    expect(resumenDe(resultado, "Vehículos")?.creadas).toBe(1);
  });

  it("rechaza el vehículo cuyo cliente no está ni en el sistema ni en el archivo", async () => {
    const libro = await archivo([
      { nombre: "Vehículos", filas: [CABECERAS_VEHICULOS, ["ABC123", "Renault", "Logan", "999"]] },
    ]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro));

    expect(tx.vehiculo.create).not.toHaveBeenCalled();
    expect(resultado.filas[0]).toEqual({
      hoja: "Vehículos",
      fila: 2,
      columna: "Documento cliente",
      valor: "999",
      motivo: "No encontré ese cliente en el sistema ni en la hoja de Clientes de este archivo",
      tipo: "rechazada",
    });
  });

  it("crea un cliente homónimo cuando el documento es distinto", async () => {
    // Dos clientes distintos pueden llamarse igual: el documento manda.
    db.cliente.findMany.mockResolvedValue([{ id: "c0", nombre: "Juan Pérez", documento: "111" }]);
    const libro = await archivo([{ nombre: "Clientes", filas: [CABECERAS_CLIENTES, ["Juan Pérez", "999", "", ""]] }]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro));

    expect(tx.cliente.create).toHaveBeenCalledTimes(1);
    expect(resumenDe(resultado, "Clientes")).toMatchObject({ creadas: 1, existentes: 0 });
  });

  it("no le asigna el vehículo a un homónimo cuando el documento no existe", async () => {
    db.cliente.findMany.mockResolvedValue([{ id: "c0", nombre: "Juan Pérez", documento: "111" }]);
    const libro = await archivo([
      {
        nombre: "Vehículos",
        filas: [CABECERAS_VEHICULOS_CON_NOMBRE, ["ABC123", "Renault", "Logan", "999", "Juan Pérez"]],
      },
    ]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro));

    expect(tx.vehiculo.create).not.toHaveBeenCalled();
    expect(resultado.filas[0]?.columna).toBe("Documento cliente");
    expect(resultado.filas[0]?.motivo).toContain("No encontré ese cliente");
  });

  it("avisa cuando dos clientes comparten el nombre y el vehículo no trae documento", async () => {
    db.cliente.findMany.mockResolvedValue([
      { id: "h1", nombre: "Juan Pérez", documento: "111" },
      { id: "h2", nombre: "Juan Pérez", documento: "222" },
    ]);
    const libro = await archivo([
      { nombre: "Vehículos", filas: [CABECERAS_VEHICULOS_CON_NOMBRE, ["ABC123", "Renault", "Logan", "", "Juan Pérez"]] },
    ]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro));

    expect(tx.vehiculo.create).not.toHaveBeenCalled();
    expect(resultado.filas[0]?.columna).toBe("Nombre cliente");
    expect(resultado.filas[0]?.motivo).toContain("más de un cliente con ese nombre");
  });

  it("omite un vehículo cuya placa ya existe, escrita con otro formato", async () => {
    db.vehiculo.findMany.mockResolvedValue([{ placa: "ABC-123" }]);
    const libro = await archivo([
      { nombre: "Vehículos", filas: [CABECERAS_VEHICULOS, ["ABC123", "Renault", "Logan", "1"]] },
    ]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro));

    expect(tx.vehiculo.create).not.toHaveBeenCalled();
    expect(resumenDe(resultado, "Vehículos")).toMatchObject({ creadas: 0, existentes: 1 });
    expect(resultado.filas[0]?.motivo).toBe("Ya existe en el sistema");
  });

  it("da margen a la transacción: Prisma la aborta a los 5 segundos por defecto", async () => {
    const libro = await archivo([{ nombre: "Clientes", filas: [CABECERAS_CLIENTES, ["Ana", "1", "", ""]] }]);

    await importarAction(resultadoVacio(), enviar(libro));

    expect(mockTxOpciones).toHaveBeenCalledWith({ maxWait: 10_000, timeout: 120_000 });
  });

  it("importa repuestos y deja el stock inicial como entrada de mercancía", async () => {
    const libro = await archivo([
      {
        nombre: "Repuestos",
        filas: [
          CABECERAS_REPUESTOS,
          ["FIL-001", "Filtro de aceite", "12.500,50", "25.000", "10"],
          ["FIL-002", "Filtro de aire", "8.000", "18.000", ""],
        ],
      },
    ]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro, { bodegaId: "b1", proveedorId: "p1" }));

    expect(resultado.error).toBeNull();
    expect(tx.repuesto.create).toHaveBeenCalledTimes(2);
    expect(tx.repuesto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        codigo: "FIL-001",
        precioCompra: 12500.5,
        stockActual: 0,
        bodegaId: "b1",
        proveedorId: "p1",
      }),
      select: { id: true },
    });
    // Una sola entrada para las filas con cantidad, con su item y su incremento.
    expect(tx.entradaMercancia.create).toHaveBeenCalledTimes(1);
    expect(tx.entradaMercancia.create).toHaveBeenCalledWith({
      data: { proveedorId: "p1", bodegaId: "b1", creadoPorId: "u1" },
      select: { id: true },
    });
    expect(tx.entradaMercanciaItem.create).toHaveBeenCalledTimes(1);
    expect(tx.entradaMercanciaItem.create).toHaveBeenCalledWith({
      data: { entradaId: "e1", repuestoId: "r1", cantidad: 10, precioCompraUnitario: 12500.5 },
    });
    expect(tx.repuesto.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { stockActual: { increment: 10 } } });
    expect(resumenDe(resultado, "Repuestos")?.creadas).toBe(2);
  });

  it("exige la bodega para los repuestos y comprueba que sea de la sede activa", async () => {
    const libro = await archivo([{ nombre: "Repuestos", filas: [CABECERAS_REPUESTOS, ["FIL-001", "Filtro", "1", "2", ""]] }]);

    expect((await importarAction(resultadoVacio(), enviar(libro))).error).toBe(
      "Elige la bodega donde entran los repuestos",
    );

    db.bodega.findFirst.mockResolvedValue(null);
    expect((await importarAction(resultadoVacio(), enviar(libro, { bodegaId: "b-ajena" }))).error).toBe(
      "La bodega seleccionada no pertenece a tu sede activa.",
    );
    expect(db.bodega.findFirst).toHaveBeenCalledWith({
      where: { id: "b-ajena", sedeId: "sede-1" },
      select: { id: true },
    });
    expect(tx.repuesto.create).not.toHaveBeenCalled();
  });

  it("rechaza la cantidad inicial si no se eligió proveedor (y no importa esa fila)", async () => {
    const libro = await archivo([
      { nombre: "Repuestos", filas: [CABECERAS_REPUESTOS, ["FIL-001", "Filtro", "1.000", "2.000", "10"]] },
    ]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro, { bodegaId: "b1" }));

    expect(tx.repuesto.create).not.toHaveBeenCalled();
    expect(resultado.filas[0]?.motivo).toContain("elige un proveedor");
    expect(resumenDe(resultado, "Repuestos")?.rechazadas).toBe(1);
  });

  it("solo deja importar servicios a un ADMIN", async () => {
    const libro = await archivo([{ nombre: "Servicios", filas: [CABECERAS_SERVICIOS, ["Alineación", "30.000"]] }]);

    mockRequireRole.mockResolvedValue(RECEPCION);
    const comoRecepcion = await importarAction(resultadoVacio(), enviar(libro));
    expect(comoRecepcion.resumen[0]).toEqual({
      hoja: "Servicios",
      leidas: 1,
      creadas: 0,
      existentes: 0,
      rechazadas: 0,
      estado: "omitida",
      motivo: "Solo un administrador puede importar servicios",
    });
    expect(tx.servicio.create).not.toHaveBeenCalled();

    mockRequireRole.mockResolvedValue(ADMIN);
    const comoAdmin = await importarAction(resultadoVacio(), enviar(libro));
    expect(tx.servicio.create).toHaveBeenCalledWith({
      data: { nombre: "Alineación", descripcion: null, precioManoObra: 30000, activo: true },
    });
    expect(resumenDe(comoAdmin, "Servicios")?.creadas).toBe(1);
  });

  it("omite la hoja a la que le faltan columnas y sigue con las demás", async () => {
    const libro = await archivo([
      { nombre: "Clientes", filas: [CABECERAS_CLIENTES, ["Ana", "1", "", ""]] },
      { nombre: "Repuestos", filas: [["Nombre", "Precio venta"], ["Filtro", "25.000"]] },
    ]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro, { bodegaId: "b1" }));

    expect(resumenDe(resultado, "Clientes")?.creadas).toBe(1);
    expect(resumenDe(resultado, "Repuestos")).toEqual({
      hoja: "Repuestos",
      leidas: 0,
      creadas: 0,
      existentes: 0,
      rechazadas: 0,
      estado: "omitida",
      motivo: "Faltan columnas obligatorias: Código, Precio compra",
    });
  });

  it("si una hoja falla al escribir, las anteriores conservan sus creadas y esa se reporta como error", async () => {
    // El mock de $transaction no revierte (no hay base real), así que este test
    // comprueba el reporte por hoja de D11, no la reversión en sí.
    tx.servicio.create.mockRejectedValue({ code: "P2002" });
    const libro = await archivo([
      { nombre: "Clientes", filas: [CABECERAS_CLIENTES, ["Ana", "1", "", ""]] },
      { nombre: "Servicios", filas: [CABECERAS_SERVICIOS, ["Alineación", "30.000"]] },
    ]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro));

    expect(resumenDe(resultado, "Clientes")?.creadas).toBe(1);
    const servicios = resumenDe(resultado, "Servicios");
    expect(servicios?.estado).toBe("error");
    expect(servicios?.creadas).toBe(0);
    expect(servicios?.motivo).toBeTruthy();
  });

  it("una hoja de Repuestos que falla tampoco tumba las anteriores", async () => {
    tx.repuesto.create.mockRejectedValue({ code: "P2002" });
    const libro = await archivo([
      { nombre: "Clientes", filas: [CABECERAS_CLIENTES, ["Ana", "1", "", ""]] },
      { nombre: "Repuestos", filas: [CABECERAS_REPUESTOS, ["FIL-001", "Filtro", "1.000", "2.000", ""]] },
    ]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro, { bodegaId: "b1" }));

    expect(resumenDe(resultado, "Clientes")?.creadas).toBe(1);
    expect(resumenDe(resultado, "Repuestos")?.estado).toBe("error");
    expect(tx.entradaMercancia.create).not.toHaveBeenCalled();
  });

  it("cuenta las novedades que no caben en el reporte", async () => {
    const filas: unknown[][] = [CABECERAS_CLIENTES];
    for (let indice = 0; indice < 205; indice += 1) filas.push([`Cliente ${indice}`, String(indice), "", "no-es-correo"]);
    const libro = await archivo([{ nombre: "Clientes", filas }]);

    const resultado = await importarAction(resultadoVacio(), enviar(libro));

    expect(resultado.filas).toHaveLength(200);
    expect(resultado.filasOcultas).toBe(5);
    expect(resultado.filas[0]?.columna).toBe("Correo");
  });

  it("revalida las rutas afectadas al terminar", async () => {
    const { revalidatePath } = await import("next/cache");
    const libro = await archivo([{ nombre: "Clientes", filas: [CABECERAS_CLIENTES, ["Ana", "1", "", ""]] }]);

    await importarAction(resultadoVacio(), enviar(libro));

    const rutas = (revalidatePath as unknown as { mock: { calls: string[][] } }).mock.calls.map(([ruta]) => ruta);
    expect(rutas).toEqual(expect.arrayContaining(["/clientes", "/repuestos", "/servicios", "/importar"]));
  });
});
