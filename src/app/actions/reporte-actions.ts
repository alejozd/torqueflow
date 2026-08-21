"use server";

import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { reporteFiltrosSchema } from "@/lib/validation/reporte";
import { buildRangoFechas } from "@/lib/reportes/rango-fechas";
import { computeRentabilidad, type RentabilidadTotales } from "@/lib/reportes/rentabilidad";
import { computeProductividad, type ProductividadFila } from "@/lib/reportes/productividad";

/** Raw filters as they arrive from the URL. The date range is mandatory. */
export interface ReporteFiltros {
  desde: string;
  hasta: string;
  sedeId?: string;
}

/** Filters actually applied, with the sede activa already substituted in. */
export interface ReporteFiltrosAplicados {
  desde: string;
  hasta: string;
  sedeId: string;
}

export interface ReporteRentabilidadResult {
  filtros: ReporteFiltrosAplicados;
  error: string | null;
  totales: RentabilidadTotales;
}

export async function getReporteRentabilidad(filtros: ReporteFiltros): Promise<ReporteRentabilidadResult> {
  // Guard first: this is a read-only endpoint, there is nothing to parse for
  // an unauthorized caller. Rentabilidad exposes cost and margin — ADMIN only.
  const session = await requireRole(["ADMIN"]);

  const parsed = reporteFiltrosSchema.safeParse({
    desde: filtros.desde,
    hasta: filtros.hasta,
    sedeId: filtros.sedeId ?? "",
  });
  if (!parsed.success) {
    return {
      filtros: {
        desde: filtros.desde,
        hasta: filtros.hasta,
        sedeId: filtros.sedeId || session.user.sedeActivaId,
      },
      error: parsed.error.issues[0]?.message ?? "Filtros inválidos",
      totales: computeRentabilidad([]),
    };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  // No lookup: the sede activa comes from the validated session (Fase 1
  // backlog #21's rule, applied to sede state). An explicit sedeId lets an
  // ADMIN compare against another sede -- the design doc's "sede como
  // dimensión de filtro/comparación" (§5 módulo 12).
  const sedeId = parsed.data.sedeId || session.user.sedeActivaId;
  const aplicados: ReporteFiltrosAplicados = {
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
    sedeId,
  };

  const rango = buildRangoFechas(parsed.data.desde, parsed.data.hasta);
  const facturas = await tenantDb.factura.findMany({
    where: {
      createdAt: { gte: rango.gte, lt: rango.lt },
      orden: { sedeId },
    },
    select: {
      total: true,
      subtotal: true,
      descuento: true,
      orden: {
        select: {
          items: { select: { cantidad: true, repuesto: { select: { precioCompra: true } } } },
          manoDeObra: { select: { horas: true, precioHora: true } },
        },
      },
    },
  });

  const totales = computeRentabilidad(
    facturas.map((factura) => ({
      total: Number(factura.total),
      base: Number(factura.subtotal) - Number(factura.descuento),
      items: factura.orden.items.map((item) => ({
        cantidad: item.cantidad,
        precioCompra: item.repuesto ? Number(item.repuesto.precioCompra) : null,
      })),
      manoDeObra: factura.orden.manoDeObra.map((linea) => ({
        horas: Number(linea.horas),
        precioHora: Number(linea.precioHora),
      })),
    })),
  );

  return { filtros: aplicados, error: null, totales };
}

export interface ReporteProductividadResult {
  filtros: ReporteFiltrosAplicados;
  error: string | null;
  filas: ProductividadFila[];
}

/**
 * Anchored on entregadaAt (stamped by updateEstadoOrdenAction on the
 * TERMINADA -> ENTREGADA transition), deliberately NOT on Factura.createdAt:
 * this report answers "who delivered what in this window". An ENTREGADA orden
 * has no outgoing transition and cannot be mutated once invoiced, so its
 * ManoDeObra lines are final.
 */
export async function getReporteProductividad(filtros: ReporteFiltros): Promise<ReporteProductividadResult> {
  const session = await requireRole(["ADMIN"]);

  const parsed = reporteFiltrosSchema.safeParse({
    desde: filtros.desde,
    hasta: filtros.hasta,
    sedeId: filtros.sedeId ?? "",
  });
  if (!parsed.success) {
    return {
      filtros: {
        desde: filtros.desde,
        hasta: filtros.hasta,
        sedeId: filtros.sedeId || session.user.sedeActivaId,
      },
      error: parsed.error.issues[0]?.message ?? "Filtros inválidos",
      filas: [],
    };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = parsed.data.sedeId || session.user.sedeActivaId;
  const aplicados: ReporteFiltrosAplicados = {
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
    sedeId,
  };

  const rango = buildRangoFechas(parsed.data.desde, parsed.data.hasta);
  const ordenes = await tenantDb.ordenTrabajo.findMany({
    where: {
      sedeId,
      estado: "ENTREGADA",
      entregadaAt: { gte: rango.gte, lt: rango.lt },
    },
    select: {
      mecanicoId: true,
      // select-only: never pull the whole Usuario row (passwordHash leak class).
      mecanico: { select: { nombre: true } },
      manoDeObra: { select: { horas: true, precioHora: true } },
    },
  });

  const filas = computeProductividad(
    ordenes.map((orden) => ({
      mecanicoId: orden.mecanicoId,
      mecanicoNombre: orden.mecanico?.nombre ?? null,
      manoDeObra: orden.manoDeObra.map((linea) => ({
        horas: Number(linea.horas),
        precioHora: Number(linea.precioHora),
      })),
    })),
  );

  return { filtros: aplicados, error: null, filas };
}
