"use server";

import { revalidatePath } from "next/cache";
import { requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { facturarOrdenInputSchema, tarifasFacturaSchema } from "@/lib/validation/factura";
import { resolverIvaPct } from "@/lib/iva/resolver";
import { leerIdConceptoOrden } from "@/lib/orden/conceptos-orden";
import { assertOrdenFacturable } from "@/lib/factura/facturable-guard";
import { ANTICIPO_CAMBIO, ANTICIPOS_EXCEDEN, emitirFacturaEnTransaccion, STOCK_INSUFICIENTE } from "@/lib/factura/emitir";
import { computeFacturaTotales } from "@/lib/factura/totales";
import { totalOrden } from "@/lib/dashboard/calculos";
import { scopeFactura, scopeOrden } from "@/lib/sede/scope";
import { emitirTrasFacturar } from "@/lib/factura-electronica/servicio";
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

const FACTURA_DETAIL_INCLUDE = {
  cliente: true,
  orden: { include: { vehiculo: true, items: true, manoDeObra: true } },
  pagos: { orderBy: { createdAt: "desc" } },
  emitidaPor: { select: { id: true, nombre: true } },
  documentosElectronicos: { where: { tipo: "FACTURA" }, select: { estado: true }, take: 1 },
} satisfies Prisma.FacturaInclude;

export type FacturaWithDetalle = Prisma.FacturaGetPayload<{ include: typeof FACTURA_DETAIL_INCLUDE }>;

export async function listFacturas(estado?: EstadoFactura): Promise<FacturaWithDetalle[]> {
  const session = await requirePermiso("facturas.ver");
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.factura.findMany({
    where: { ...scopeFactura(session.user.sedeActivaId), ...(estado ? { estado } : {}) },
    include: FACTURA_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getFactura(id: string): Promise<FacturaWithDetalle | null> {
  const session = await requirePermiso("facturas.ver");
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
  const session = await requirePermiso("facturas.ver");
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

  const session = await requirePermiso("facturas.facturar");
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

  // La tarifa de cada línea se revisa al facturar: las que llegan se validan
  // (tarifa activa, o la misma que ya tenía) y se guardan en la orden.
  let tarifasCrudas: unknown = [];
  try {
    tarifasCrudas = JSON.parse(String(formData.get("tarifas") ?? "[]"));
  } catch {
    return { error: "Tarifas de IVA inválidas", success: false, facturaId: null };
  }
  const tarifas = tarifasFacturaSchema.safeParse(tarifasCrudas);
  if (!tarifas.success) {
    return { error: tarifas.error.issues[0]?.message ?? "Tarifas de IVA inválidas", success: false, facturaId: null };
  }
  const cambiosItems = new Map<string, number>();
  const cambiosManoDeObra = new Map<string, number>();
  for (const tarifa of tarifas.data) {
    const linea = leerIdConceptoOrden(tarifa.conceptoId);
    const actual =
      linea?.tabla === "item"
        ? orden.items.find((item) => item.id === linea.id)
        : linea?.tabla === "mo"
          ? orden.manoDeObra.find((mano) => mano.id === linea.id)
          : undefined;
    if (!linea || !actual) {
      return { error: "Una de las líneas no es de esta orden", success: false, facturaId: null };
    }
    const iva = await resolverIvaPct(tenantDb, tarifa.ivaPct, Number(actual.ivaPct));
    if (!iva.ok) return { error: iva.error, success: false, facturaId: null };
    if (iva.ivaPct === Number(actual.ivaPct)) continue;
    (linea.tabla === "item" ? cambiosItems : cambiosManoDeObra).set(linea.id, iva.ivaPct);
  }
  const ordenConTarifas = {
    ...orden,
    items: orden.items.map((item) => ({ ...item, ivaPct: cambiosItems.get(item.id) ?? item.ivaPct })),
    manoDeObra: orden.manoDeObra.map((mano) => ({ ...mano, ivaPct: cambiosManoDeObra.get(mano.id) ?? mano.ivaPct })),
  };

  const descuento = parsed.data.descuento ?? 0;
  const { subtotal } = computeFacturaTotales({
    items: orden.items.map((item) => ({ cantidad: item.cantidad, precioUnitario: Number(item.precioUnitario) })),
    manoDeObra: orden.manoDeObra.map((linea) => ({
      valor: Number(linea.valor),
    })),
    descuento,
  });

  if (descuento > subtotal) {
    return { error: "El descuento no puede ser mayor al subtotal", success: false, facturaId: null };
  }

  let facturaId: string;
  try {
    const factura = await tenantDb.$transaction(async (tx) => {
      for (const [id, ivaPct] of cambiosItems) await tx.itemOrden.update({ where: { id }, data: { ivaPct } });
      for (const [id, ivaPct] of cambiosManoDeObra) await tx.manoDeObra.update({ where: { id }, data: { ivaPct } });
      return emitirFacturaEnTransaccion(tx, ordenConTarifas, descuento, session.user.id);
    });
    facturaId = factura.id;
  } catch (err) {
    if (err instanceof Error && err.message === ANTICIPOS_EXCEDEN) {
      return {
        error: "Los anticipos superan el total de la factura. Devuelve el excedente antes de facturar.",
        success: false,
        facturaId: null,
      };
    }
    if (err instanceof Error && err.message === ANTICIPO_CAMBIO) {
      return {
        error: "Un anticipo de esta orden cambió mientras se facturaba. Intenta de nuevo.",
        success: false,
        facturaId: null,
      };
    }
    if (err instanceof Error && err.message === STOCK_INSUFICIENTE) {
      return { error: "Stock insuficiente para uno de los repuestos de esta orden", success: false, facturaId: null };
    }
    return { error: friendlyPrismaErrorMessage(err, "Error al generar la factura"), success: false, facturaId: null };
  }

  // Factura electrónica (solo si el taller la tiene activa y con envío automático). Va fuera de
  // la transacción de la factura: un fallo nunca la deshace; el documento queda para reintentar.
  await emitirTrasFacturar({ db: tenantDb, tenantSchema: session.user.tenantSchema, usuarioId: session.user.id }, facturaId);

  revalidatePath(`/ordenes/${ordenId}`);
  revalidatePath("/facturas");
  revalidatePath("/repuestos");
  return { error: null, success: true, facturaId };
}
