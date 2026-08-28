"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { facturarOrdenInputSchema } from "@/lib/validation/factura";
import { assertOrdenFacturable } from "@/lib/factura/facturable-guard";
import { computeFacturaTotales } from "@/lib/factura/totales";
import { totalOrden } from "@/lib/dashboard/calculos";
import { scopeFactura, scopeOrden } from "@/lib/sede/scope";
import type { EstadoFactura, Prisma } from "@/generated/prisma-tenant";

export interface FacturaFormState {
  error: string | null;
  success: boolean;
  facturaId: string | null;
}

export interface OrdenFacturableOption {
  id: string;
  placa: string;
  clienteNombre: string;
  clienteDocumento: string | null;
  total: number;
}

const STOCK_INSUFICIENTE = "STOCK_INSUFICIENTE";

const FACTURA_DETAIL_INCLUDE = {
  cliente: true,
  orden: { include: { vehiculo: true, items: true, manoDeObra: true } },
  pagos: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.FacturaInclude;

export type FacturaWithDetalle = Prisma.FacturaGetPayload<{ include: typeof FACTURA_DETAIL_INCLUDE }>;

export async function listFacturas(estado?: EstadoFactura): Promise<FacturaWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.factura.findMany({
    where: { ...scopeFactura(session.user.sedeActivaId), ...(estado ? { estado } : {}) },
    include: FACTURA_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getFactura(id: string): Promise<FacturaWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.factura.findFirst({
    where: { id, ...scopeFactura(session.user.sedeActivaId) },
    include: FACTURA_DETAIL_INCLUDE,
  });
}

/**
 * Órdenes an ADMIN/RECEPCION can pick from the "Nueva factura" dialog:
 * facturable estado (assertOrdenFacturable's own rule) AND not already
 * invoiced -- crearFacturaAction rejects the latter anyway, but filtering it
 * out here keeps the picker from listing dead ends.
 */
export async function listOrdenesFacturables(): Promise<OrdenFacturableOption[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const ordenes = await tenantDb.ordenTrabajo.findMany({
    where: {
      ...scopeOrden(session.user.sedeActivaId),
      estado: { in: ["TERMINADA", "ENTREGADA"] },
      factura: null,
    },
    select: {
      id: true,
      vehiculo: { select: { placa: true } },
      cliente: { select: { nombre: true, documento: true } },
      items: { select: { cantidad: true, precioUnitario: true } },
      manoDeObra: { select: { valor: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return ordenes.map((orden) => ({
    id: orden.id,
    placa: orden.vehiculo.placa,
    clienteNombre: orden.cliente.nombre,
    clienteDocumento: orden.cliente.documento,
    total: totalOrden({
      items: orden.items.map((item) => ({ cantidad: item.cantidad, precioUnitario: Number(item.precioUnitario) })),
      manoDeObra: orden.manoDeObra.map((linea) => ({ valor: Number(linea.valor) })),
    }),
  }));
}

export async function crearFacturaAction(
  ordenId: string,
  prevState: FacturaFormState,
  formData: FormData,
): Promise<FacturaFormState> {
  const parsed = facturarOrdenInputSchema.safeParse({
    descuento: formData.get("descuento") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, facturaId: null };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    include: { items: true, manoDeObra: true, factura: { select: { id: true } } },
  });
  if (!orden) {
    return { error: "Orden no encontrada", success: false, facturaId: null };
  }
  if (orden.factura) {
    return { error: "Esta orden ya tiene una factura generada", success: false, facturaId: null };
  }
  try {
    assertOrdenFacturable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no facturable", success: false, facturaId: null };
  }

  const descuento = parsed.data.descuento ?? 0;
  const { subtotal, iva, total } = computeFacturaTotales({
    items: orden.items.map((item) => ({ cantidad: item.cantidad, precioUnitario: Number(item.precioUnitario) })),
    manoDeObra: orden.manoDeObra.map((linea) => ({
      valor: Number(linea.valor),
    })),
    descuento,
  });

  if (descuento > subtotal) {
    return { error: "El descuento no puede ser mayor al subtotal", success: false, facturaId: null };
  }

  const decrementosStock = new Map<string, number>();
  for (const item of orden.items) {
    if (item.repuestoId) {
      decrementosStock.set(item.repuestoId, (decrementosStock.get(item.repuestoId) ?? 0) + item.cantidad);
    }
  }

  let facturaId: string;
  try {
    const factura = await tenantDb.$transaction(async (tx) => {
      const creada = await tx.factura.create({
        data: {
          ordenId,
          clienteId: orden.clienteId,
          subtotal,
          descuento,
          iva,
          total,
          saldoPendiente: total,
          emitidaPorId: session.user.id,
          estado: total <= 0 ? "PAGADA" : "PENDIENTE",
        },
      });
      for (const [repuestoId, cantidad] of decrementosStock) {
        const { count } = await tx.repuesto.updateMany({
          where: { id: repuestoId, stockActual: { gte: cantidad } },
          data: { stockActual: { decrement: cantidad } },
        });
        if (count === 0) {
          throw new Error(STOCK_INSUFICIENTE);
        }
      }
      return creada;
    });
    facturaId = factura.id;
  } catch (err) {
    if (err instanceof Error && err.message === STOCK_INSUFICIENTE) {
      return { error: "Stock insuficiente para uno de los repuestos de esta orden", success: false, facturaId: null };
    }
    return { error: friendlyPrismaErrorMessage(err, "Error al generar la factura"), success: false, facturaId: null };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  revalidatePath("/facturas");
  revalidatePath("/repuestos");
  return { error: null, success: true, facturaId };
}
