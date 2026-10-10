"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { publicDb } from "@/lib/db/public-client";
import type { TipoVehiculoValor } from "@/lib/validation/vehiculo";
import { leerDiasAviso } from "@/lib/vencimientos/configuracion";
import {
  diasHastaVencimiento,
  estadoVencimiento,
  fechaLimiteAviso,
  requiereAviso,
  type EstadoVencimiento,
  type TipoDocumento,
} from "@/lib/vencimientos/estado-vencimiento";
import { textoAvisoVencimiento } from "@/lib/vencimientos/plantilla";
import { urlWhatsapp } from "@/lib/whatsapp/url";

export interface FilaVencimiento {
  id: string;
  vehiculoId: string;
  placa: string;
  tipoVehiculo: TipoVehiculoValor;
  clienteNombre: string;
  tipo: TipoDocumento;
  fechaVencimiento: Date;
  diasRestantes: number;
  estado: EstadoVencimiento;
  ultimoAviso: { canal: "EMAIL" | "WHATSAPP"; enviadoAt: Date } | null;
  urlWhatsapp: string | null;
}

async function nombreTaller(tenantSchema: string): Promise<string> {
  const tenant = await publicDb.tenant.findUnique({ where: { schemaName: tenantSchema }, select: { nombre: true, slug: true } });
  return tenant?.nombre || tenant?.slug || "Nuestro taller";
}

/**
 * Documentos (SOAT/RTM) por vencer o vencidos de todo el taller -- tenant-wide,
 * como /clientes. Sin límite inferior: a diferencia del barrido de email, la
 * vista sí muestra vencidos de hace meses (recepción decide si insistir).
 */
export async function listVencimientos(): Promise<FilaVencimiento[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const ahora = new Date();
  const [diasAviso, tallerNombre] = await Promise.all([
    leerDiasAviso(tenantDb),
    nombreTaller(session.user.tenantSchema),
  ]);
  const hasta = fechaLimiteAviso(ahora, diasAviso);

  const vehiculos = await tenantDb.vehiculo.findMany({
    where: { OR: [{ soatVence: { lte: hasta } }, { tecnomecanicaVence: { lte: hasta } }] },
    select: {
      id: true,
      placa: true,
      tipo: true,
      soatVence: true,
      tecnomecanicaVence: true,
      cliente: { select: { nombre: true, telefono: true } },
      avisosVencimiento: {
        orderBy: { enviadoAt: "desc" },
        select: { tipo: true, fechaVencimiento: true, canal: true, enviadoAt: true },
      },
    },
  });

  const filas: FilaVencimiento[] = [];
  for (const vehiculo of vehiculos) {
    const fechas: [TipoDocumento, Date | null][] = [
      ["SOAT", vehiculo.soatVence],
      ["TECNOMECANICA", vehiculo.tecnomecanicaVence],
    ];
    for (const [tipo, fecha] of fechas) {
      if (!fecha) continue;
      const estado = estadoVencimiento(fecha, ahora, diasAviso);
      if (!requiereAviso(estado)) continue;

      const ultimo = vehiculo.avisosVencimiento.find(
        (aviso) => aviso.tipo === tipo && aviso.fechaVencimiento.getTime() === fecha.getTime(),
      );
      filas.push({
        id: `${vehiculo.id}-${tipo}`,
        vehiculoId: vehiculo.id,
        placa: vehiculo.placa,
        tipoVehiculo: vehiculo.tipo,
        clienteNombre: vehiculo.cliente.nombre,
        tipo,
        fechaVencimiento: fecha,
        diasRestantes: diasHastaVencimiento(fecha, ahora),
        estado,
        ultimoAviso: ultimo ? { canal: ultimo.canal, enviadoAt: ultimo.enviadoAt } : null,
        urlWhatsapp: urlWhatsapp(
          vehiculo.cliente.telefono,
          textoAvisoVencimiento({
            clienteNombre: vehiculo.cliente.nombre,
            placa: vehiculo.placa,
            tipo,
            fechaVencimiento: fecha,
            tallerNombre,
            ahora,
          }),
        ),
      });
    }
  }

  return filas.sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/**
 * Registra que recepción abrió el wa.me de un aviso. El navegador ya abrió el
 * enlace de forma síncrona en el clic (los bloqueadores de popups se tragan un
 * window.open después de un await), así que aquí solo se deja constancia.
 * Upsert por la clave única: un segundo clic sobre la misma fecha no duplica.
 */
export async function registrarAvisoWhatsappAction(
  vehiculoId: string,
  tipo: TipoDocumento,
): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const vehiculo = await tenantDb.vehiculo.findUnique({
    where: { id: vehiculoId },
    select: { soatVence: true, tecnomecanicaVence: true, cliente: { select: { telefono: true } } },
  });
  if (!vehiculo) return { error: "Vehículo no encontrado" };

  const fechaVencimiento = tipo === "SOAT" ? vehiculo.soatVence : vehiculo.tecnomecanicaVence;
  if (!fechaVencimiento) return { error: "El vehículo no tiene fecha de vencimiento registrada" };
  const telefono = vehiculo.cliente.telefono;
  if (!telefono) return { error: "El cliente no tiene teléfono registrado" };

  const clave = { vehiculoId, tipo, fechaVencimiento, canal: "WHATSAPP" as const };
  await tenantDb.avisoVencimiento.upsert({
    where: { vehiculoId_tipo_fechaVencimiento_canal: clave },
    create: { ...clave, destino: telefono, enviadoPorId: session.user.id },
    update: { destino: telefono, enviadoPorId: session.user.id, enviadoAt: new Date() },
  });

  revalidatePath("/vencimientos");
  return { error: null };
}
