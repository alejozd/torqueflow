"use server";

import { requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { leerDiasEstancada } from "@/lib/orden/configuracion-estancada";
import {
  ORDEN_PRIORIDAD,
  alertaDeOrden,
  diasSinActividad,
  limiteHistorialAlertas,
  type MotivoAlerta,
} from "@/lib/orden/flujo";
import { scopeOrden } from "@/lib/sede/scope";
import type { PrioridadOrden } from "@/generated/prisma-tenant";

export interface AlertaTaller {
  ordenId: string;
  motivo: MotivoAlerta;
  /** Días completos sin actividad. */
  dias: number;
  prioridad: PrioridadOrden;
  placa: string;
  cliente: string;
  mecanico: string | null;
  sintomas: string | null;
}

export interface AlertasTaller {
  diasUmbral: number;
  alertas: AlertaTaller[];
}

/**
 * Órdenes que necesitan atención (Fase 22, D6/D7): en proceso sin actividad y
 * terminadas que nadie recogió. La regla vive en `src/lib/orden/flujo.ts`; aquí
 * solo se traen las filas que puede necesitar (estados vivos de la sede activa)
 * y se cruzan con el umbral configurado. No se filtra por fecha en SQL a
 * propósito: la actividad incluye lo cargado a la orden, así que la decisión es
 * en memoria y con una sola lectura.
 */
export async function getAlertasTaller(): Promise<AlertasTaller> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const ahora = new Date();
  const [diasUmbral, ordenes] = await Promise.all([
    leerDiasEstancada(tenantDb),
    tenantDb.ordenTrabajo.findMany({
      where: {
        ...scopeOrden(session.user.sedeActivaId),
        estado: { in: ["EN_PROCESO", "TERMINADA"] },
        // Acotado a un año (D16): sin esto se recorrería todo el histórico de
        // órdenes terminadas de la sede en cada carga del Inicio.
        createdAt: { gte: limiteHistorialAlertas(ahora) },
      },
      select: {
        id: true,
        estado: true,
        createdAt: true,
        updatedAt: true,
        prioridad: true,
        sintomas: true,
        items: { select: { createdAt: true } },
        manoDeObra: { select: { createdAt: true } },
        dvi: { select: { updatedAt: true, fotos: { select: { createdAt: true } } } },
        danios: { select: { createdAt: true } },
        vehiculo: { select: { placa: true } },
        cliente: { select: { nombre: true } },
        mecanico: { select: { nombre: true } },
      },
      orderBy: { updatedAt: "asc" },
    }),
  ]);

  const alertas = ordenes.flatMap((orden): AlertaTaller[] => {
    const motivo = alertaDeOrden(orden, { ahora, diasUmbral });
    if (!motivo) return [];
    return [
      {
        ordenId: orden.id,
        motivo,
        dias: diasSinActividad(orden, ahora),
        prioridad: orden.prioridad,
        placa: orden.vehiculo.placa,
        cliente: orden.cliente.nombre,
        mecanico: orden.mecanico?.nombre ?? null,
        sintomas: orden.sintomas,
      },
    ];
  });

  // Lo más urgente primero y, a igualdad, lo que lleva más días parado.
  alertas.sort(
    (a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] || b.dias - a.dias,
  );

  return { diasUmbral, alertas };
}
