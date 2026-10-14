import type { getTenantDb } from "@/lib/db/tenant-client";
import { filaCajaCerrada, type CajaCerradaFila } from "@/lib/caja/resumen";
import type { RangoExportacion } from "./rango-fechas";

/**
 * Consultas de los reportes con rango de fechas (consolidación, D9). Viven fuera
 * de los archivos `"use server"` a propósito: así no quedan expuestas como
 * acciones que el cliente pueda llamar con un rango sin validar. Quien las llama
 * (la ruta de exportación) ya comprobó el rol, validó el rango y saca la sede de
 * la sesión.
 */

type TenantDb = ReturnType<typeof getTenantDb>;

export interface VentaExportada {
  numero: number;
  createdAt: Date;
  clienteNombre: string | null;
  total: number;
  saldoPendiente: number;
  estado: string;
  items: { cantidad: number; descripcion: string }[];
}

export async function ventasDelRango(
  tenantDb: TenantDb,
  sedeId: string,
  rango: RangoExportacion,
): Promise<VentaExportada[]> {
  const ventas = await tenantDb.ventaMostrador.findMany({
    where: { sedeId, createdAt: { gte: rango.gte, lt: rango.lt } },
    select: {
      numero: true,
      createdAt: true,
      total: true,
      saldoPendiente: true,
      estado: true,
      cliente: { select: { nombre: true } },
      items: { select: { cantidad: true, descripcion: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return ventas.map((venta) => ({
    numero: venta.numero,
    createdAt: venta.createdAt,
    clienteNombre: venta.cliente?.nombre ?? null,
    total: Number(venta.total),
    saldoPendiente: Number(venta.saldoPendiente),
    estado: venta.estado,
    items: venta.items,
  }));
}

export async function arqueosDelRango(
  tenantDb: TenantDb,
  sedeId: string,
  rango: RangoExportacion,
): Promise<CajaCerradaFila[]> {
  const cajas = await tenantDb.cajaSesion.findMany({
    where: { sedeId, cerradaAt: { not: null }, abiertaAt: { gte: rango.gte, lt: rango.lt } },
    include: { abiertaPor: { select: { nombre: true } }, cerradaPor: { select: { nombre: true } } },
    orderBy: { abiertaAt: "asc" },
  });
  return cajas.map(filaCajaCerrada);
}
