"use server";

import { requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { resolverSede } from "@/lib/gastos/validaciones-db";
import { reporteFiltrosSchema } from "@/lib/validation/reporte";
import { buildRangoDias, buildRangoFechas } from "@/lib/reportes/rango-fechas";
import { computeRentabilidad, type RentabilidadTotales } from "@/lib/reportes/rentabilidad";
import { computeRentabilidadNeta, type RentabilidadNeta } from "@/lib/gastos/rentabilidad-neta";
import { contarRecurrentesPendientesEnRango } from "@/lib/gastos/pendientes-db";
import { roundMoney } from "@/lib/money/round";
import { computeProduccionPorMecanico, type ProduccionFila } from "@/lib/liquidaciones/produccion";

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
  neta: RentabilidadNeta;
  gastosPorCategoria: { categoria: string; monto: number; porcentaje: number }[];
  recurrentesSinConfirmar: number;
}

export async function getReporteRentabilidad(filtros: ReporteFiltros): Promise<ReporteRentabilidadResult> {
  // Guard first: this is a read-only endpoint, there is nothing to parse for
  // an unauthorized caller. Rentabilidad exposes cost and margin — ADMIN only.
  const session = await requirePermiso("reportes.rentabilidad");

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
        sedeId: resolverSede(session, filtros.sedeId),
      },
      error: parsed.error.issues[0]?.message ?? "Filtros inválidos",
      totales: computeRentabilidad([]),
      neta: computeRentabilidadNeta(computeRentabilidad([]), 0),
      gastosPorCategoria: [],
      recurrentesSinConfirmar: 0,
    };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  // No lookup: the sede activa comes from the validated session (Fase 1
  // backlog #21's rule, applied to sede state). An explicit sedeId lets
  // quien tiene `sedes.verTodas` compare against another sede -- the design
  // doc's "sede como dimensión de filtro/comparación" (§5 módulo 12). Sin ese
  // permiso se ignora y manda la sede activa (Fase 26, I1).
  const sedeId = resolverSede(session, parsed.data.sedeId || undefined);
  const aplicados: ReporteFiltrosAplicados = {
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
    sedeId,
  };

  const rango = buildRangoFechas(parsed.data.desde, parsed.data.hasta);
  // Los gastos se filtran por `fecha`, que es de solo día (@db.Date): otro rango.
  const dias = buildRangoDias(parsed.data.desde, parsed.data.hasta);
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
          manoDeObra: { select: { valor: true } },
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
        valor: Number(linea.valor),
      })),
    })),
  );

  const gastosAgrupados = await tenantDb.gasto.groupBy({
    by: ["categoriaId"],
    where: { sedeId, fecha: { gte: dias.gte, lt: dias.lt } },
    _sum: { monto: true },
  });
  const categorias = await tenantDb.categoriaGasto.findMany({
    where: { id: { in: gastosAgrupados.map((fila) => fila.categoriaId) } },
    select: { id: true, nombre: true },
  });
  const nombrePorId = new Map(categorias.map((categoria) => [categoria.id, categoria.nombre]));
  const gastosTotal = roundMoney(gastosAgrupados.reduce((suma, fila) => suma + Number(fila._sum.monto ?? 0), 0));
  const gastosPorCategoria = gastosAgrupados
    .map((fila) => {
      const monto = roundMoney(Number(fila._sum.monto ?? 0));
      return {
        categoria: nombrePorId.get(fila.categoriaId) ?? "Sin categoría",
        monto,
        porcentaje: gastosTotal === 0 ? 0 : roundMoney((monto / gastosTotal) * 100),
      };
    })
    .sort((a, b) => b.monto - a.monto);
  const recurrentesSinConfirmar = await contarRecurrentesPendientesEnRango(
    session.user.tenantSchema,
    sedeId,
    dias.gte,
    dias.lt,
  );

  return {
    filtros: aplicados,
    error: null,
    totales,
    neta: computeRentabilidadNeta(totales, gastosTotal),
    gastosPorCategoria,
    recurrentesSinConfirmar,
  };
}

export interface ReporteProductividadResult {
  filtros: ReporteFiltrosAplicados;
  error: string | null;
  filas: ProduccionFila[];
}

/**
 * Anchored on entregadaAt (stamped by updateEstadoOrdenAction on the
 * TERMINADA -> ENTREGADA transition), deliberately NOT on Factura.createdAt:
 * this report answers "who delivered what in this window". An ENTREGADA orden
 * has no outgoing transition and cannot be mutated once invoiced, so its
 * ManoDeObra lines are final.
 *
 * El trabajo se atribuye por línea (D3 de la Fase 19), no por orden: se
 * seleccionan el mecánico de la orden y el de cada línea para que
 * `atribuirManoDeObra` decida. Es la misma lógica que usa la liquidación.
 */
export async function getReporteProductividad(filtros: ReporteFiltros): Promise<ReporteProductividadResult> {
  const session = await requirePermiso("reportes.productividad");

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
        sedeId: resolverSede(session, filtros.sedeId),
      },
      error: parsed.error.issues[0]?.message ?? "Filtros inválidos",
      filas: [],
    };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  // Sin `sedes.verTodas` (p. ej. el jefe de taller) manda la sede activa (I1).
  const sedeId = resolverSede(session, parsed.data.sedeId || undefined);
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
      manoDeObra: {
        select: {
          valor: true,
          mecanicoId: true,
          mecanico: { select: { nombre: true } },
        },
      },
    },
  });

  const filas = computeProduccionPorMecanico(
    ordenes.map((orden) => ({
      mecanicoId: orden.mecanicoId,
      mecanicoNombre: orden.mecanico?.nombre ?? null,
      manoDeObra: orden.manoDeObra.map((linea) => ({
        valor: Number(linea.valor),
        mecanicoId: linea.mecanicoId,
        mecanicoNombre: linea.mecanico?.nombre ?? null,
      })),
    })),
  );

  return { filtros: aplicados, error: null, filas };
}
