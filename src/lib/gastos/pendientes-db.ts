// Sin "use server": estas funciones no deben quedar expuestas como endpoints.
import { getTenantDb } from "@/lib/db/tenant-client";
import { calcularRecurrentesPendientes, type PlantillaParaPendientes } from "./recurrentes-pendientes";
import { periodoActualBogota } from "./periodo";

type TenantDb = ReturnType<typeof getTenantDb>;

/** Plantillas activas de la sede con los periodos ya confirmados u omitidos. */
export async function cargarPlantillasParaPendientes(
  tenantDb: TenantDb,
  sedeId: string,
): Promise<PlantillaParaPendientes[]> {
  const plantillas = await tenantDb.gastoRecurrente.findMany({
    where: { sedeId, activo: true },
    include: {
      categoria: { select: { nombre: true } },
      gastos: { where: { periodo: { not: null } }, select: { periodo: true } },
      omitidos: { select: { periodo: true } },
    },
  });
  return plantillas.map((p) => ({
    id: p.id,
    descripcion: p.descripcion,
    categoriaNombre: p.categoria.nombre,
    montoEstimado: Number(p.montoEstimado),
    diaDelMes: p.diaDelMes,
    desde: p.desde,
    activo: p.activo,
    periodosResueltos: [
      ...p.gastos.flatMap((g) => (g.periodo ? [g.periodo] : [])),
      ...p.omitidos.map((o) => o.periodo),
    ],
  }));
}

/**
 * Cuenta pendientes cuya fechaSugerida cae en [gte, lt). Sin guard propio: la
 * llama el reporte, que ya pasó `requireRole(["ADMIN"])`.
 */
export async function contarRecurrentesPendientesEnRango(
  tenantSchema: string,
  sedeId: string,
  gte: Date,
  lt: Date,
): Promise<number> {
  const plantillas = await cargarPlantillasParaPendientes(getTenantDb(tenantSchema), sedeId);
  return calcularRecurrentesPendientes(plantillas, periodoActualBogota(new Date())).filter(
    (p) => p.fechaSugerida >= gte && p.fechaSugerida < lt,
  ).length;
}
