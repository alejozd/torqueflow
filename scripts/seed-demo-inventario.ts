import { getTenantDb } from "@/lib/db/tenant-client";

/**
 * Demo data for the dashboard's inventory alerts and pedidos de compra, for
 * dev/staging tenants only (it invents sales history). Run AFTER
 * `repuestos:seed` and once the tenant has clientes with vehículos:
 *
 * 1. Proveedores by brand (with lead times) assigned to repuestos without one.
 * 2. Pack sizes and stock máximo on some repuestos.
 * 3. 90 days of invoiced ordenes (consumption history) — marker [seed-consumo].
 * 4. 21 days of recent activity + open ordenes committing stock — [seed-reciente].
 * 5. Historical purchase entradas with a price change, for "última compra".
 * 6. Optionally, one test email on every cliente and proveedor, so no real
 *    person receives mail while testing sends.
 *
 * Current stock is never modified: everything here is history. Steps 3-5 are
 * skipped when their marker already exists, so re-running is safe.
 */

const MARCA_CONSUMO = "[seed-consumo]";
const MARCA_RECIENTE = "[seed-reciente]";
const MS_DIA = 24 * 60 * 60 * 1000;

export const PROVEEDORES_DEMO = [
  { nombre: "Bosch Colombia", diasEntrega: 2, telefono: "+57 601 555 0142" },
  { nombre: "Distribuidora Gates", diasEntrega: 5, telefono: "+57 604 555 0199" },
  { nombre: "Autopartes Andina", diasEntrega: 4, telefono: null },
  { nombre: "Terpel", diasEntrega: 1, telefono: null },
] as const;

/** Lubricants and fluids go to Terpel whatever their brand; then by brand; the rest to Autopartes Andina. */
export function proveedorDemoPara(nombreRepuesto: string): (typeof PROVEEDORES_DEMO)[number]["nombre"] {
  const nombre = nombreRepuesto.toLowerCase();
  if (/aceite de motor|refrigerante|líquido|liquido|lubric/.test(nombre)) return "Terpel";
  if (nombre.includes("bosch")) return "Bosch Colombia";
  if (nombre.includes("gates")) return "Distribuidora Gates";
  return "Autopartes Andina";
}

export const PACKS_DEMO = [
  { patron: "Bujía", multiploCompra: 4 },
  { patron: "Aceite de motor", multiploCompra: 6 },
  { patron: "Refrigerante", multiploCompra: 6 },
  { patron: "Filtro", multiploCompra: 2 },
] as const;

/** Deterministic pseudo-random generator so two runs on fresh tenants produce the same data. */
export function crearAzar(semilla: number) {
  let estado = semilla;
  const azar = () => (estado = (estado * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  return {
    azar,
    entero: (min: number, max: number) => min + Math.floor(azar() * (max - min + 1)),
    elegir: <T>(lista: readonly T[]) => lista[Math.floor(azar() * lista.length)],
  };
}

export interface SeedDemoInventarioInput {
  schemaName: string;
  correoPruebas?: string;
}

export interface SeedDemoInventarioResult {
  proveedoresAsignados: number;
  ordenesConsumo: number;
  ordenesRecientes: number;
  ordenesAbiertas: number;
  entradas: number;
  correosActualizados: number;
}

type TenantDb = ReturnType<typeof getTenantDb>;

interface RepuestoDemo {
  id: string;
  nombre: string;
  proveedorId: string | null;
  stockActual: number;
  stockMinimo: number;
  precioCompra: unknown;
  precioVenta: unknown;
  bodegaId: string;
}

async function crearOrdenFacturada(
  db: TenantDb,
  datos: {
    sedeId: string;
    adminId: string;
    mecanicoId: string | null;
    vehiculo: { id: string; clienteId: string };
    fecha: Date;
    sintomas: string;
    items: { repuestoId: string; descripcion: string; cantidad: number; precio: number }[];
    manoDeObra: number;
    pagada: boolean;
    metodo: "EFECTIVO" | "TARJETA" | "TRANSFERENCIA";
  },
) {
  const subtotal = datos.items.reduce((suma, item) => suma + item.cantidad * item.precio, 0) + datos.manoDeObra;
  const iva = Math.round(subtotal * 0.19);
  const total = subtotal + iva;
  const orden = await db.ordenTrabajo.create({
    data: {
      estado: "ENTREGADA",
      clienteId: datos.vehiculo.clienteId,
      vehiculoId: datos.vehiculo.id,
      sedeId: datos.sedeId,
      mecanicoId: datos.mecanicoId,
      creadoPorId: datos.adminId,
      sintomas: datos.sintomas,
      createdAt: new Date(datos.fecha.getTime() - MS_DIA),
      updatedAt: datos.fecha,
      entregadaAt: datos.fecha,
      items: {
        create: datos.items.map((item) => ({
          repuestoId: item.repuestoId,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precioUnitario: item.precio,
          createdAt: new Date(datos.fecha.getTime() - MS_DIA),
        })),
      },
      manoDeObra: { create: [{ descripcion: "Mano de obra", valor: datos.manoDeObra }] },
    },
  });
  const factura = await db.factura.create({
    data: {
      ordenId: orden.id,
      clienteId: datos.vehiculo.clienteId,
      subtotal,
      descuento: 0,
      iva,
      total,
      saldoPendiente: datos.pagada ? 0 : total,
      estado: datos.pagada ? "PAGADA" : "PENDIENTE",
      emitidaPorId: datos.adminId,
      createdAt: datos.fecha,
      updatedAt: datos.fecha,
    },
  });
  if (datos.pagada) {
    await db.pago.create({
      data: { facturaId: factura.id, monto: total, metodoPago: datos.metodo, registradoPorId: datos.adminId, createdAt: datos.fecha },
    });
  }
}

export async function seedDemoInventario({ schemaName, correoPruebas }: SeedDemoInventarioInput): Promise<SeedDemoInventarioResult> {
  const db = getTenantDb(schemaName);
  const { azar, entero, elegir } = crearAzar(20261009);
  const hoy = Date.now();
  const resultado: SeedDemoInventarioResult = {
    proveedoresAsignados: 0,
    ordenesConsumo: 0,
    ordenesRecientes: 0,
    ordenesAbiertas: 0,
    entradas: 0,
    correosActualizados: 0,
  };

  // 1. Proveedores y asignación
  const proveedorId = new Map<string, string>();
  for (const demo of PROVEEDORES_DEMO) {
    const existente = await db.proveedor.findFirst({ where: { nombre: demo.nombre }, select: { id: true } });
    const proveedor = existente
      ? await db.proveedor.update({ where: { id: existente.id }, data: { diasEntrega: demo.diasEntrega }, select: { id: true } })
      : await db.proveedor.create({
          data: { nombre: demo.nombre, diasEntrega: demo.diasEntrega, telefono: demo.telefono },
          select: { id: true },
        });
    proveedorId.set(demo.nombre, proveedor.id);
  }
  const repuestos: RepuestoDemo[] = await db.repuesto.findMany({
    select: { id: true, nombre: true, proveedorId: true, stockActual: true, stockMinimo: true, precioCompra: true, precioVenta: true, bodegaId: true },
  });
  for (const repuesto of repuestos) {
    if (repuesto.proveedorId) continue;
    repuesto.proveedorId = proveedorId.get(proveedorDemoPara(repuesto.nombre))!;
    await db.repuesto.update({ where: { id: repuesto.id }, data: { proveedorId: repuesto.proveedorId } });
    resultado.proveedoresAsignados++;
  }

  // 2. Empaques y stock máximo
  for (const { patron, multiploCompra } of PACKS_DEMO) {
    await db.repuesto.updateMany({ where: { nombre: { contains: patron } }, data: { multiploCompra } });
  }
  for (const repuesto of repuestos.filter((r) => r.nombre.includes("Bosch")).slice(0, 6)) {
    await db.repuesto.update({ where: { id: repuesto.id }, data: { stockMaximo: repuesto.stockMinimo * 3 } });
  }

  const sede = await db.sede.findFirst({ select: { id: true } });
  const admin = await db.usuario.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  const vehiculos = await db.vehiculo.findMany({ select: { id: true, clienteId: true } });
  if (!sede || !admin || vehiculos.length === 0) {
    throw new Error(`Schema "${schemaName}" needs a sede, an ADMIN user and at least one vehículo before seeding history.`);
  }
  const tecnicos = await db.usuario.findMany({ where: { role: "TECNICO" }, select: { id: true } });
  const mecanico = () => (tecnicos.length ? elegir(tecnicos).id : null);
  const metodo = () => elegir(["EFECTIVO", "TARJETA", "TRANSFERENCIA"] as const);

  const comprometido = new Map<string, number>();
  for (const item of await db.itemOrden.findMany({
    where: { repuestoId: { not: null }, orden: { estado: { not: "ANULADA" }, factura: null } },
    select: { repuestoId: true, cantidad: true },
  })) {
    comprometido.set(item.repuestoId!, (comprometido.get(item.repuestoId!) ?? 0) + item.cantidad);
  }
  const disponible = (r: RepuestoDemo) => r.stockActual - (comprometido.get(r.id) ?? 0);
  const alertados = repuestos.filter((r) => disponible(r) <= r.stockMinimo);
  const alertadosConStock = alertados.filter((r) => disponible(r) > 0);
  const linea = (r: RepuestoDemo, cantidad: number) => ({ repuestoId: r.id, descripcion: r.nombre, cantidad, precio: Number(r.precioVenta) });

  // 3. Historial de 90 días
  if ((await db.ordenTrabajo.count({ where: { sintomas: { startsWith: MARCA_CONSUMO } } })) === 0) {
    const rapidos = alertadosConStock.slice(0, 4);
    const pool = [...alertados, ...repuestos.filter((r) => !alertados.includes(r)).slice(0, 12)];
    for (let k = 0; k < 36; k++) {
      const items: ReturnType<typeof linea>[] = [];
      if (rapidos.length && azar() < 0.85) items.push(linea(elegir(rapidos), entero(2, 4)));
      for (let j = entero(1, 3); j > 0; j--) {
        const r = elegir(pool);
        if (!items.some((item) => item.repuestoId === r.id)) items.push(linea(r, entero(1, 2)));
      }
      await crearOrdenFacturada(db, {
        sedeId: sede.id,
        adminId: admin.id,
        mecanicoId: mecanico(),
        vehiculo: elegir(vehiculos),
        fecha: new Date(hoy - entero(1, 88) * MS_DIA - entero(1, 8) * 60 * 60 * 1000),
        sintomas: `${MARCA_CONSUMO} Mantenimiento preventivo`,
        items,
        manoDeObra: entero(4, 16) * 10000,
        pagada: true,
        metodo: metodo(),
      });
      resultado.ordenesConsumo++;
    }

    // 5. Compras históricas: dos entradas por proveedor, la reciente ~6% más cara
    const porProveedor = new Map<string, RepuestoDemo[]>();
    for (const r of alertados) porProveedor.set(r.proveedorId!, [...(porProveedor.get(r.proveedorId!) ?? []), r]);
    for (const [idProveedor, lista] of porProveedor) {
      for (const [diasAtras, factor] of [[entero(55, 70), 0.94], [entero(12, 25), 1]] as const) {
        const fecha = new Date(hoy - diasAtras * MS_DIA);
        await db.entradaMercancia.create({
          data: {
            proveedorId: idProveedor,
            bodegaId: lista[0].bodegaId,
            creadoPorId: admin.id,
            createdAt: fecha,
            items: {
              create: lista.map((r) => ({
                repuestoId: r.id,
                cantidad: entero(4, 12),
                precioCompraUnitario: Math.round(Number(r.precioCompra) * factor),
                createdAt: fecha,
              })),
            },
          },
        });
        resultado.entradas++;
      }
    }
  }

  // 4. Últimas 3 semanas + órdenes abiertas que comprometen stock
  if ((await db.ordenTrabajo.count({ where: { sintomas: { startsWith: MARCA_RECIENTE } } })) === 0) {
    const cercaDelMinimo = repuestos.filter((r) => disponible(r) > r.stockMinimo && disponible(r) <= r.stockMinimo + 4).slice(0, 8);
    const rapidos = [...alertadosConStock.slice(0, 10), ...cercaDelMinimo.slice(0, 4)];
    const pool = [...rapidos, ...repuestos.slice(0, 20)];
    for (let k = 0; k < 40 && rapidos.length > 0; k++) {
      const items: ReturnType<typeof linea>[] = [];
      for (let j = entero(1, 3); j > 0; j--) {
        const r = elegir(rapidos);
        if (!items.some((item) => item.repuestoId === r.id)) items.push(linea(r, entero(1, 3)));
      }
      const extra = elegir(pool);
      if (!items.some((item) => item.repuestoId === extra.id)) items.push(linea(extra, 1));
      await crearOrdenFacturada(db, {
        sedeId: sede.id,
        adminId: admin.id,
        mecanicoId: mecanico(),
        vehiculo: elegir(vehiculos),
        fecha: new Date(hoy - (k < 20 ? entero(0, 6) : entero(7, 21)) * MS_DIA - entero(1, 6) * 60 * 60 * 1000),
        sintomas: `${MARCA_RECIENTE} ${elegir(["Cambio de frenos", "Mantenimiento 10.000 km", "Revisión general", "Cambio de aceite y filtros"])}`,
        items,
        manoDeObra: entero(5, 20) * 10000,
        pagada: azar() < 0.8,
        metodo: metodo(),
      });
      resultado.ordenesRecientes++;
    }
    for (const r of cercaDelMinimo.slice(0, 5)) {
      const vehiculo = elegir(vehiculos);
      await db.ordenTrabajo.create({
        data: {
          estado: resultado.ordenesAbiertas % 2 === 0 ? "EN_PROCESO" : "BORRADOR",
          clienteId: vehiculo.clienteId,
          vehiculoId: vehiculo.id,
          sedeId: sede.id,
          mecanicoId: mecanico(),
          creadoPorId: admin.id,
          sintomas: `${MARCA_RECIENTE} Reparación en curso`,
          items: {
            create: [
              {
                repuestoId: r.id,
                descripcion: r.nombre,
                cantidad: disponible(r) - r.stockMinimo + entero(1, 3),
                precioUnitario: Number(r.precioVenta),
              },
            ],
          },
        },
      });
      resultado.ordenesAbiertas++;
    }
  }

  // 6. Correo de pruebas
  if (correoPruebas) {
    resultado.correosActualizados += (await db.cliente.updateMany({ data: { email: correoPruebas } })).count;
    resultado.correosActualizados += (await db.proveedor.updateMany({ data: { email: correoPruebas } })).count;
  }

  return resultado;
}
