"use server";

import { puede, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { scopeCita, scopeFactura, scopeOrdenVisible } from "@/lib/sede/scope";
import { buildRangoFechas } from "@/lib/reportes/rango-fechas";
import { totalOrden, ultimosNDiasIso } from "@/lib/dashboard/calculos";
import { resumirFacturacion, type ResumenFacturacion } from "@/lib/dashboard/facturacion-semana";
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
  vehiculoMarca: string;
  vehiculoModelo: string;
  vehiculoAnio: number | null;
  clienteNombre: string;
  mecanicoNombre: string | null;
  estado: EstadoOrden;
  total: number;
}

export interface CitaHoyRow {
  id: string;
  hora: string;
  placa: string;
  vehiculoMarca: string;
  vehiculoModelo: string;
  motivo: string;
  clienteNombre: string;
  estado: EstadoCita;
}

export interface DashboardOverview {
  enTaller: { total: number; terminadasHoy: number };
  citasHoy: { total: number; proxima: { hora: string; placa: string } | null };
  porFacturar: { count: number; monto: number };
  cartera: { saldoPendiente: number; facturasPendientes: number; ventasMostradorPendientes: number };
  flujo: { borrador: number; enProceso: number; terminadas: number; entregadasHoy: number };
  ordenesActivasCount: number;
  ordenesRecientes: OrdenRecienteRow[];
  agendaHoy: CitaHoyRow[];
  /** La semana (últimos 7 días de Bogotá) frente a los 7 anteriores. */
  facturacion: ResumenFacturacion;
}

/**
 * Every aggregation the Inicio/Dashboard page needs (Fase 11-14 UI redesign),
 * gathered in one read-only server action so the page issues one call and
 * one session/tenant resolution instead of one per KPI. "Today" and the
 * 7-day window are Bogotá calendar days (src/lib/reportes/rango-fechas.ts):
 * with UTC days the Inicio rolled over to "tomorrow" at 7 p.m. local time.
 *
 * Inventory alerts (and the "Stock bajo" KPI) come from the separate
 * getAlertasInventario action.
 */
export async function getDashboardOverview(): Promise<DashboardOverview> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeActivaId = session.user.sedeActivaId;
  // D7: el técnico cuenta solo las órdenes donde trabaja.
  const scopeOrdenes = scopeOrdenVisible(sedeActivaId, session.user.id, puede(session, "ordenes.verTodas"));

  const hoy = new Date();
  // 14 días: la semana del gráfico y la anterior, para compararlas.
  const dias14 = ultimosNDiasIso(hoy, 14);
  const hoyIso = dias14[dias14.length - 1]!;
  const rangoHoy = buildRangoFechas(hoyIso, hoyIso);
  const rangoUltimos14Dias = buildRangoFechas(dias14[0]!, hoyIso);

  const [
    enTallerTotal,
    terminadasHoyCount,
    citasHoyTotal,
    proximaCita,
    ordenesPorFacturar,
    carteraAgg,
    facturasPendientesCount,
    borradorCount,
    enProcesoCount,
    terminadasCount,
    entregadasHoyCount,
    ordenesActivasCount,
    ordenesRecientes,
    citasHoyRows,
    facturasUltimos14Dias,
    carteraMostradorAgg,
  ] = await Promise.all([
    tenantDb.ordenTrabajo.count({
      where: { ...scopeOrdenes, estado: { in: ["BORRADOR", "EN_PROCESO", "TERMINADA"] } },
    }),
    tenantDb.ordenTrabajo.count({
      where: { ...scopeOrdenes, estado: "TERMINADA", updatedAt: { gte: rangoHoy.gte, lt: rangoHoy.lt } },
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
      where: { ...scopeOrdenes, estado: "TERMINADA", factura: null },
      select: {
        items: { select: { cantidad: true, precioUnitario: true } },
        manoDeObra: { select: { valor: true } },
      },
    }),
    tenantDb.factura.aggregate({
      where: { ...scopeFactura(sedeActivaId), estado: "PENDIENTE" },
      _sum: { saldoPendiente: true },
    }),
    tenantDb.factura.count({ where: { ...scopeFactura(sedeActivaId), estado: "PENDIENTE" } }),
    tenantDb.ordenTrabajo.count({ where: { ...scopeOrdenes, estado: "BORRADOR" } }),
    tenantDb.ordenTrabajo.count({ where: { ...scopeOrdenes, estado: "EN_PROCESO" } }),
    tenantDb.ordenTrabajo.count({ where: { ...scopeOrdenes, estado: "TERMINADA" } }),
    tenantDb.ordenTrabajo.count({
      where: { ...scopeOrdenes, estado: "ENTREGADA", entregadaAt: { gte: rangoHoy.gte, lt: rangoHoy.lt } },
    }),
    tenantDb.ordenTrabajo.count({ where: { ...scopeOrdenes, estado: { not: "ANULADA" } } }),
    tenantDb.ordenTrabajo.findMany({
      where: { ...scopeOrdenes, estado: { not: "ANULADA" } },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: {
        id: true,
        estado: true,
        vehiculo: { select: { placa: true, marca: true, modelo: true, anio: true } },
        cliente: { select: { nombre: true } },
        mecanico: { select: { nombre: true } },
        items: { select: { cantidad: true, precioUnitario: true } },
        manoDeObra: { select: { valor: true } },
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
        vehiculo: { select: { placa: true, marca: true, modelo: true } },
        cliente: { select: { nombre: true } },
      },
    }),
    tenantDb.factura.findMany({
      where: { ...scopeFactura(sedeActivaId), createdAt: { gte: rangoUltimos14Dias.gte, lt: rangoUltimos14Dias.lt } },
      select: { createdAt: true, total: true, saldoPendiente: true },
    }),
    // La cartera del Inicio incluye lo que los clientes deben del mostrador, igual que /cartera.
    tenantDb.ventaMostrador.aggregate({
      where: { sedeId: sedeActivaId, estado: "PENDIENTE", saldoPendiente: { gt: 0 } },
      _sum: { saldoPendiente: true },
      _count: { _all: true },
    }),
  ]);

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
            manoDeObra: orden.manoDeObra.map((linea) => ({ valor: Number(linea.valor) })),
          }),
        0,
      ),
    },
    cartera: {
      saldoPendiente: Number(carteraAgg._sum.saldoPendiente ?? 0) + Number(carteraMostradorAgg._sum.saldoPendiente ?? 0),
      facturasPendientes: facturasPendientesCount,
      ventasMostradorPendientes: carteraMostradorAgg._count?._all ?? 0,
    },
    flujo: {
      borrador: borradorCount,
      enProceso: enProcesoCount,
      terminadas: terminadasCount,
      entregadasHoy: entregadasHoyCount,
    },
    ordenesActivasCount,
    ordenesRecientes: ordenesRecientes.map((orden) => ({
      id: orden.id,
      placa: orden.vehiculo.placa,
      vehiculoMarca: orden.vehiculo.marca,
      vehiculoModelo: orden.vehiculo.modelo,
      vehiculoAnio: orden.vehiculo.anio,
      clienteNombre: orden.cliente.nombre,
      mecanicoNombre: orden.mecanico?.nombre ?? null,
      estado: orden.estado,
      total: orden.factura
        ? Number(orden.factura.total)
        : totalOrden({
            items: orden.items.map((item) => ({ cantidad: item.cantidad, precioUnitario: Number(item.precioUnitario) })),
            manoDeObra: orden.manoDeObra.map((linea) => ({ valor: Number(linea.valor) })),
          }),
    })),
    agendaHoy: citasHoyRows.map((cita) => ({
      id: cita.id,
      hora: formatoHora(cita.fechaHora),
      placa: cita.vehiculo.placa,
      vehiculoMarca: cita.vehiculo.marca,
      vehiculoModelo: cita.vehiculo.modelo,
      motivo: cita.motivo,
      clienteNombre: cita.cliente.nombre,
      estado: cita.estado,
    })),
    facturacion: resumirFacturacion(
      facturasUltimos14Dias.map((factura) => ({
        createdAt: factura.createdAt,
        total: Number(factura.total),
        saldoPendiente: Number(factura.saldoPendiente),
      })),
      dias14,
    ),
  };
}
