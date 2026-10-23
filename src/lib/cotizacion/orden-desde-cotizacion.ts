import type { Prisma } from "@/generated/prisma-tenant";

export interface CotizacionParaOrden {
  id: string;
  clienteId: string;
  vehiculoId: string;
  sedeId: string;
  items: {
    tipo: "REPUESTO" | "MANO_OBRA";
    repuestoId: string | null;
    descripcion: string;
    cantidad: Prisma.Decimal | number;
    precioUnitario: Prisma.Decimal | number;
    grupoKitId: string | null;
    grupoKitNombre: string | null;
    servicioId: string | null;
  }[];
}

/** Datos que la app no fija al aprobar (la orden nace en BORRADOR, sin síntomas); solo los usa el script de datos de ejemplo. */
export interface OpcionesOrdenDesdeCotizacion {
  sintomas?: string;
  creada?: Date;
}

/**
 * Parte de la aprobación de una cotización que ocurre dentro de la transacción: crea la orden,
 * copia cada línea (repuestos a ItemOrden, mano de obra a ManoDeObra, con su kit de origen) y
 * enlaza la cotización como APROBADA. Vive fuera de cotizacion-actions.ts porque ese módulo es
 * `"use server"` y todo lo que exporta quedaría expuesto como endpoint.
 */
export async function crearOrdenDesdeCotizacion(
  tx: Prisma.TransactionClient,
  cotizacion: CotizacionParaOrden,
  creadoPorId: string,
  opciones: OpcionesOrdenDesdeCotizacion = {},
): Promise<{ id: string }> {
  const tiempos = opciones.creada ? { createdAt: opciones.creada, updatedAt: opciones.creada } : {};
  const creada = await tx.ordenTrabajo.create({
    data: {
      clienteId: cotizacion.clienteId,
      vehiculoId: cotizacion.vehiculoId,
      sedeId: cotizacion.sedeId,
      creadoPorId,
      ...(opciones.sintomas ? { sintomas: opciones.sintomas } : {}),
      ...tiempos,
    },
  });

  for (const item of cotizacion.items) {
    // La orden recuerda de qué kit salió cada línea, igual que la cotización.
    const grupo = {
      grupoKitId: item.grupoKitId,
      grupoKitNombre: item.grupoKitNombre,
      servicioId: item.servicioId,
    };
    const lineaCreada = opciones.creada ? { createdAt: opciones.creada } : {};
    if (item.tipo === "REPUESTO") {
      await tx.itemOrden.create({
        data: {
          ordenId: creada.id,
          repuestoId: item.repuestoId,
          descripcion: item.descripcion,
          cantidad: Math.round(Number(item.cantidad)),
          precioUnitario: item.precioUnitario,
          ...grupo,
          ...lineaCreada,
        },
      });
    } else {
      await tx.manoDeObra.create({
        data: {
          ordenId: creada.id,
          descripcion: item.descripcion,
          valor: Number(item.cantidad) * Number(item.precioUnitario),
          ...grupo,
          ...lineaCreada,
        },
      });
    }
  }

  await tx.cotizacion.update({
    where: { id: cotizacion.id },
    data: { estado: "APROBADA", ordenId: creada.id, ...(opciones.creada ? { updatedAt: opciones.creada } : {}) },
  });

  return creada;
}
