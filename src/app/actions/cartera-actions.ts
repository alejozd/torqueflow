"use server";

import { requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { publicDb } from "@/lib/db/public-client";
import { agruparCartera, CONSUMIDOR_FINAL_ID, type FacturaCartera, type ClienteCartera, type RangoAntiguedad } from "@/lib/cartera/antiguedad";
import { resolverSede } from "@/lib/gastos/validaciones-db";
import { urlWhatsapp } from "@/lib/whatsapp/url";

export interface ClienteCarteraVista extends ClienteCartera {
  /** Enlace wa.me con el recordatorio de cobro; null si el cliente no tiene teléfono. */
  urlWhatsapp: string | null;
}

export interface CarteraVista {
  sedeId: string;
  clientes: ClienteCarteraVista[];
  totales: Record<RangoAntiguedad, number> & { total: number };
}

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

async function nombreTaller(tenantSchema: string): Promise<string> {
  const tenant = await publicDb.tenant.findUnique({ where: { schemaName: tenantSchema }, select: { nombre: true, slug: true } });
  return tenant?.nombre || tenant?.slug || "Nuestro taller";
}

function textoCobro(cliente: ClienteCartera, tallerNombre: string): string {
  const facturas = cliente.facturas.filter((d) => d.origen !== "MOSTRADOR").map((d) => d.numero);
  const ventas = cliente.facturas.filter((d) => d.origen === "MOSTRADOR").map((d) => `M-${d.numero}`);
  const partes: string[] = [];
  if (facturas.length > 0) partes.push(`${facturas.length === 1 ? "factura" : "facturas"} ${facturas.join(", ")}`);
  if (ventas.length > 0) partes.push(`${ventas.length === 1 ? "venta" : "ventas"} de mostrador ${ventas.join(", ")}`);
  return (
    `Hola ${cliente.clienteNombre}, te recordamos que tienes un saldo pendiente de ` +
    `${formatoMoneda.format(cliente.saldoTotal)} con ${tallerNombre} (${partes.join(" y ")}). ` +
    "Puedes pagar en el taller o por transferencia. ¡Gracias!"
  );
}

/**
 * Facturas y ventas de mostrador con saldo de la sede, agrupadas por cliente y antigüedad. RECEPCION
 * siempre ve su sede activa; ADMIN puede pedir otra. El texto de cobro se arma
 * aquí, en el servidor: el cliente solo recibe el enlace wa.me ya listo.
 */
export async function getCartera(filtros: { sedeId?: string }): Promise<CarteraVista> {
  const session = await requirePermiso("cartera.ver");
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = resolverSede(session, filtros.sedeId);

  const facturas = await tenantDb.factura.findMany({
    where: { estado: "PENDIENTE", saldoPendiente: { gt: 0 }, orden: { sedeId } },
    select: {
      id: true,
      numero: true,
      total: true,
      saldoPendiente: true,
      createdAt: true,
      cliente: { select: { id: true, nombre: true, telefono: true } },
    },
  });

  const ventas = await tenantDb.ventaMostrador.findMany({
    where: { estado: "PENDIENTE", saldoPendiente: { gt: 0 }, sedeId },
    select: {
      id: true,
      numero: true,
      total: true,
      saldoPendiente: true,
      createdAt: true,
      cliente: { select: { id: true, nombre: true, telefono: true } },
    },
  });

  const documentos: FacturaCartera[] = [
    ...facturas.map((factura) => ({
      facturaId: factura.id,
      origen: "FACTURA" as const,
      numero: factura.numero,
      clienteId: factura.cliente.id,
      clienteNombre: factura.cliente.nombre,
      clienteTelefono: factura.cliente.telefono,
      emitidaAt: factura.createdAt,
      total: Number(factura.total),
      saldo: Number(factura.saldoPendiente),
    })),
    ...ventas.map((venta) => ({
      facturaId: venta.id,
      origen: "MOSTRADOR" as const,
      numero: venta.numero,
      clienteId: venta.cliente?.id ?? CONSUMIDOR_FINAL_ID,
      clienteNombre: venta.cliente?.nombre ?? "Consumidor final",
      clienteTelefono: venta.cliente?.telefono ?? null,
      emitidaAt: venta.createdAt,
      total: Number(venta.total),
      saldo: Number(venta.saldoPendiente),
    })),
  ];

  const { clientes, totales } = agruparCartera(
    documentos,
    new Date(),
  );

  const tallerNombre = clientes.length > 0 ? await nombreTaller(session.user.tenantSchema) : "";

  return {
    sedeId,
    totales,
    clientes: clientes.map((cliente) => ({
      ...cliente,
      urlWhatsapp: urlWhatsapp(cliente.clienteTelefono, textoCobro(cliente, tallerNombre)),
    })),
  };
}
