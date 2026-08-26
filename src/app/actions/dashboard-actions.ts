"use server";

import { requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { scopeCita, scopeFactura, scopeOrden, scopeRepuesto } from "@/lib/sede/scope";
import { buildRangoFechas } from "@/lib/reportes/rango-fechas";
import { agruparFacturacionPorDia, ordenarPorCriticidad, totalOrden, ultimosNDiasIso } from "@/lib/dashboard/calculos";
import type { EstadoCita, EstadoOrden } from "@/generated/prisma-tenant";

/**
 * America/Bogota is a fixed UTC-5 offset with no daylight saving time (same
 * assumption as src/lib/validation/cita.ts), so shifting the UTC instant back
 * 5 hours and reading its UTC wall-clock fields gives the workshop's local
 * hour without pulling in Intl/ICU timezone formatting quirks.
 */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

function formatoHora(fecha: Date): string {
  const bogota = new Date(fecha.getTime() - BOGOTA_OFFSET_MS);
  return `${String(bogota.getUTCHours()).padStart(2, "0")}:${String(bogota.getUTCMinutes()).padStart(2, "0")}`;
}

export interface OrdenRecienteRow {
  id: string;
  placa: string;
  clienteNombre: string;
  mecanicoNombre: string | null;
  estado: EstadoOrden;
  total: number;
}

export interface CitaHoyRow {
  id: string;
  hora: string;
  placa: string;
  motivo: string;
  clienteNombre: string;
  estado: EstadoCita;
}

export interface RepuestoAlertaRow {
  id: string;
  codigo: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
}

export interface DashboardOverview {
  enTaller: { total: number; terminadasHoy: number };
  citasHoy: { total: number; proxima: { hora: string; placa: string } | null };
  porFacturar: { count: number; monto: number };
  cartera: { saldoPendiente: number; facturasPendientes: number };
  stockBajo: { count: number; sinExistencias: number };
  flujo: { borrador: number; enProceso: number; terminadas: number; entregadasHoy: number };
  ordenesRecientes: OrdenRecienteRow[];
  agendaHoy: CitaHoyRow[];
  facturacion7Dias: { fecha: string; total: number }[];
  alertasInventario: RepuestoAlertaRow[];
}

/**
 * Every aggregation the Inicio/Dashboard page needs (Fase 11-14 UI redesign),
 * gathered in one read-only server action so the page issues one call and
 * one session/tenant resolution instead of one per KPI. "Today" and the
 * 7-day window use UTC calendar-day boundaries -- the same accepted
 * local-timezone limitation as src/lib/reportes/rango-fechas.ts, not
 * re-litigated here.
 *
 * stockBajo/alertasInventario are computed in JS after a single scoped
 * findMany rather than a `stockActual <= stockMinimo` DB filter: Prisma
 * cannot compare two columns of the same row in a `where` clause without
 * raw SQL, and the per-tenant repuesto count is small enough that fetching
 * the scoped set and filtering here is the honest cheap option.
 */
export async function getDashboardOverview(): Promise<DashboardOverview> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeActivaId = session.user.sedeActivaId;

  const hoy = new Date();
  const dias7 = ultimosNDiasIso(hoy, 7);
  const hoyIso = dias7[dias7.length - 1];
  const rangoHoy = buildRangoFechas(hoyIso, hoyIso);
  const rangoUltimos7Dias = buildRangoFechas(dias7[0], hoyIso);

  const [
    enTallerTotal,
    terminadasHoyCount,
    citasHoyTotal,
    proximaCita,
    ordenesPorFacturar,
    carteraAgg,
    facturasPendientesCount,
    repuestosScoped,
    borradorCount,
    enProcesoCount,
    terminadasCount,
    entregadasHoyCount,
    ordenesRecientes,
    citasHoyRows,
    facturasUltimos7Dias,
  ] = await Promise.all([
    tenantDb.ordenTrabajo.count({
      where: { ...scopeOrden(sedeActivaId), estado: { in: ["BORRADOR", "EN_PROCESO", "TERMINADA"] } },
    }),
    tenantDb.ordenTrabajo.count({
      where: { ...scopeOrden(sedeActivaId), estado: "TERMINADA", updatedAt: { gte: rangoHoy.gte, lt: rangoHoy.lt } },
    }),
    tenantDb.cita.count({
      where: { ...scopeCita(sedeActivaId), fechaHora: { gte: rangoHoy.gte, lt: rangoHoy.lt }, estado: { not: "CANCELADA" } },
    }),
    tenantDb.cita.findFirst({
      where: { ...scopeCita(sedeActivaId), fechaHora: { gte: hoy, lt: rangoHoy.lt }, estado: { not: "CANCELADA" } },
      orderBy: { fechaHora: "asc" },
      select: { fechaHora: true, vehiculo: { select: { placa: true } } },
    }),
    tenantDb.ordenTrabajo.findMany({
      where: { ...scopeOrden(sedeActivaId), estado: "TERMINADA", factura: null },
      select: {
        items: { select: { cantidad: true, precioUnitario: true } },
        manoDeObra: { select: { horas: true, precioHora: true } },
      },
    }),
    tenantDb.factura.aggregate({
      where: { ...scopeFactura(sedeActivaId), estado: "PENDIENTE" },
      _sum: { saldoPendiente: true },
    }),
    tenantDb.factura.count({ where: { ...scopeFactura(sedeActivaId), estado: "PENDIENTE" } }),
    tenantDb.repuesto.findMany({
      where: scopeRepuesto(sedeActivaId),
      select: { id: true, codigo: true, nombre: true, stockActual: true, stockMinimo: true },
    }),
    tenantDb.ordenTrabajo.count({ where: { ...scopeOrden(sedeActivaId), estado: "BORRADOR" } }),
    tenantDb.ordenTrabajo.count({ where: { ...scopeOrden(sedeActivaId), estado: "EN_PROCESO" } }),
    tenantDb.ordenTrabajo.count({ where: { ...scopeOrden(sedeActivaId), estado: "TERMINADA" } }),
    tenantDb.ordenTrabajo.count({
      where: { ...scopeOrden(sedeActivaId), estado: "ENTREGADA", entregadaAt: { gte: rangoHoy.gte, lt: rangoHoy.lt } },
    }),
    tenantDb.ordenTrabajo.findMany({
      where: { ...scopeOrden(sedeActivaId), estado: { not: "ANULADA" } },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: {
        id: true,
        estado: true,
        vehiculo: { select: { placa: true } },
        cliente: { select: { nombre: true } },
        mecanico: { select: { nombre: true } },
        items: { select: { cantidad: true, precioUnitario: true } },
        manoDeObra: { select: { horas: true, precioHora: true } },
        factura: { select: { total: true } },
      },
    }),
    tenantDb.cita.findMany({
      where: { ...scopeCita(sedeActivaId), fechaHora: { gte: rangoHoy.gte, lt: rangoHoy.lt } },
      orderBy: { fechaHora: "asc" },
      select: {
        id: true,
        fechaHora: true,
        motivo: true,
        estado: true,
        vehiculo: { select: { placa: true } },
        cliente: { select: { nombre: true } },
      },
    }),
    tenantDb.factura.findMany({
      where: { ...scopeFactura(sedeActivaId), createdAt: { gte: rangoUltimos7Dias.gte, lt: rangoUltimos7Dias.lt } },
      select: { createdAt: true, total: true },
    }),
  ]);

  const repuestosBajoStock = ordenarPorCriticidad(
    repuestosScoped.filter((repuesto) => repuesto.stockActual <= repuesto.stockMinimo),
  );

  return {
    enTaller: { total: enTallerTotal, terminadasHoy: terminadasHoyCount },
    citasHoy: {
      total: citasHoyTotal,
      proxima: proximaCita ? { hora: formatoHora(proximaCita.fechaHora), placa: proximaCita.vehiculo.placa } : null,
    },
    porFacturar: {
      count: ordenesPorFacturar.length,
      monto: ordenesPorFacturar.reduce(
        (sum, orden) =>
          sum +
          totalOrden({
            items: orden.items.map((item) => ({ cantidad: item.cantidad, precioUnitario: Number(item.precioUnitario) })),
            manoDeObra: orden.manoDeObra.map((linea) => ({ horas: Number(linea.horas), precioHora: Number(linea.precioHora) })),
          }),
        0,
      ),
    },
    cartera: {
      saldoPendiente: Number(carteraAgg._sum.saldoPendiente ?? 0),
      facturasPendientes: facturasPendientesCount,
    },
    stockBajo: {
      count: repuestosBajoStock.length,
      sinExistencias: repuestosBajoStock.filter((repuesto) => repuesto.stockActual === 0).length,
    },
    flujo: {
      borrador: borradorCount,
      enProceso: enProcesoCount,
      terminadas: terminadasCount,
      entregadasHoy: entregadasHoyCount,
    },
    ordenesRecientes: ordenesRecientes.map((orden) => ({
      id: orden.id,
      placa: orden.vehiculo.placa,
      clienteNombre: orden.cliente.nombre,
      mecanicoNombre: orden.mecanico?.nombre ?? null,
      estado: orden.estado,
      total: orden.factura
        ? Number(orden.factura.total)
        : totalOrden({
            items: orden.items.map((item) => ({ cantidad: item.cantidad, precioUnitario: Number(item.precioUnitario) })),
            manoDeObra: orden.manoDeObra.map((linea) => ({
              horas: Number(linea.horas),
              precioHora: Number(linea.precioHora),
            })),
          }),
    })),
    agendaHoy: citasHoyRows.map((cita) => ({
      id: cita.id,
      hora: formatoHora(cita.fechaHora),
      placa: cita.vehiculo.placa,
      motivo: cita.motivo,
      clienteNombre: cita.cliente.nombre,
      estado: cita.estado,
    })),
    facturacion7Dias: agruparFacturacionPorDia(
      facturasUltimos7Dias.map((factura) => ({ createdAt: factura.createdAt, total: Number(factura.total) })),
      dias7,
    ),
    alertasInventario: repuestosBajoStock,
  };
}
