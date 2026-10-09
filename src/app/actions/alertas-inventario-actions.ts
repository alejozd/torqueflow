"use server";

import { requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { scopeRepuesto } from "@/lib/sede/scope";
import { construirAlertasInventario, DIAS_CONSUMO, type AlertasInventario } from "@/lib/dashboard/alertas-inventario";

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Inventory alerts for the Inicio dashboard. All the rules live in
 * src/lib/dashboard/alertas-inventario.ts; this action only gathers rows,
 * scoped to the sede activa through the repuesto's bodega:
 *
 * - comprometidos: items on non-anulada ordenes without a factura yet (stock
 *   only moves on invoicing, so these units are still counted in stockActual)
 * - consumidos: items on ordenes invoiced in the last DIAS_CONSUMO days, dated
 *   by the factura since that is when the units left stock
 * - entradas: purchase history, fetched only for repuestos that end up alerted
 */
export async function getAlertasInventario(): Promise<AlertasInventario> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const scope = scopeRepuesto(session.user.sedeActivaId);
  const hoy = new Date();

  const [repuestos, comprometidos, consumidos] = await Promise.all([
    tenantDb.repuesto.findMany({
      where: scope,
      select: {
        id: true,
        codigo: true,
        nombre: true,
        stockActual: true,
        stockMinimo: true,
        precioCompra: true,
        bodega: { select: { id: true, nombre: true } },
        proveedor: { select: { id: true, nombre: true, telefono: true, email: true } },
      },
    }),
    tenantDb.itemOrden.findMany({
      where: { repuesto: scope, orden: { estado: { not: "ANULADA" }, factura: null } },
      select: {
        repuestoId: true,
        cantidad: true,
        orden: {
          select: { id: true, estado: true, vehiculo: { select: { placa: true, marca: true, modelo: true } } },
        },
      },
    }),
    tenantDb.itemOrden.findMany({
      where: {
        repuesto: scope,
        orden: { estado: { not: "ANULADA" }, factura: { createdAt: { gte: new Date(hoy.getTime() - DIAS_CONSUMO * MS_DIA) } } },
      },
      select: { repuestoId: true, cantidad: true, orden: { select: { factura: { select: { createdAt: true } } } } },
    }),
  ]);

  const repuestosInput = repuestos.map((repuesto) => ({ ...repuesto, precioCompra: Number(repuesto.precioCompra) }));
  const comprometidosInput = comprometidos.flatMap((item) =>
    item.repuestoId
      ? [
          {
            repuestoId: item.repuestoId,
            cantidad: item.cantidad,
            orden: {
              id: item.orden.id,
              estado: item.orden.estado,
              placa: item.orden.vehiculo.placa,
              vehiculo: `${item.orden.vehiculo.marca} ${item.orden.vehiculo.modelo}`,
            },
          },
        ]
      : [],
  );
  const consumidosInput = consumidos.flatMap((item) =>
    item.repuestoId && item.orden.factura
      ? [{ repuestoId: item.repuestoId, cantidad: item.cantidad, fecha: item.orden.factura.createdAt }]
      : [],
  );

  const sinHistorial = construirAlertasInventario({
    repuestos: repuestosInput,
    comprometidos: comprometidosInput,
    consumidos: consumidosInput,
    entradas: [],
    hoy,
  });
  if (sinHistorial.alertas.length === 0) return sinHistorial;

  const entradas = await tenantDb.entradaMercanciaItem.findMany({
    where: { repuestoId: { in: sinHistorial.alertas.map((alerta) => alerta.id) } },
    orderBy: { createdAt: "desc" },
    select: {
      repuestoId: true,
      cantidad: true,
      precioCompraUnitario: true,
      createdAt: true,
      entrada: { select: { proveedor: { select: { nombre: true } } } },
    },
  });

  return construirAlertasInventario({
    repuestos: repuestosInput,
    comprometidos: comprometidosInput,
    consumidos: consumidosInput,
    entradas: entradas.map((item) => ({
      repuestoId: item.repuestoId,
      cantidad: item.cantidad,
      precioCompraUnitario: Number(item.precioCompraUnitario),
      fecha: item.createdAt,
      proveedorNombre: item.entrada.proveedor.nombre,
    })),
    hoy,
  });
}
