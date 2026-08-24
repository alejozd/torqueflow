import { getTenantDb } from "@/lib/db/tenant-client";
import { CONFIGURACION_SMTP_ID, type ConfiguracionSmtpAlmacenada } from "@/lib/email/smtp-config";
import { COOLDOWN_RECORDATORIO_DIAS } from "./mantenimiento";
import type {
  RecordatoriosGateway,
  RegistroRecordatorio,
  VehiculoParaRecordatorio,
} from "./ejecutar-recordatorios";

/**
 * The only Prisma-aware piece of the reminder feature.
 *
 * These reads are deliberately NOT sede-scoped and carry no session: this is a
 * platform-level job triggered by an external scheduler, and Clientes and
 * Vehículos are tenant-wide by design (design doc §5, módulo 12). Scoping to a
 * sede here would be meaningless -- there is no "sede activa" without a user.
 */
export const prismaRecordatoriosGateway: RecordatoriosGateway = {
  async obtenerConfiguracionSmtp(schemaName: string): Promise<ConfiguracionSmtpAlmacenada | null> {
    const tenantDb = getTenantDb(schemaName);
    const fila = await tenantDb.configuracionSmtp.findUnique({
      where: { id: CONFIGURACION_SMTP_ID },
    });
    if (!fila) return null;

    return {
      host: fila.host,
      puerto: fila.puerto,
      usuario: fila.usuario,
      passwordCifrado: fila.passwordCifrado,
      fromEmail: fila.fromEmail,
      fromNombre: fila.fromNombre,
      activo: fila.activo,
    };
  },

  async listarVehiculosParaRecordatorio(schemaName: string): Promise<VehiculoParaRecordatorio[]> {
    const tenantDb = getTenantDb(schemaName);

    // Coarse, NECESSARY-but-not-SUFFICIENT pre-filter, deliberately simple (no
    // pagination): a vehicle with zero delivered service history can never be
    // due, and one already inside the 90-day cooldown is already
    // known-skippable. evaluarMantenimiento's actual km/6-month "whichever
    // first" logic still makes the real due-date decision on whatever this
    // query returns -- this where clause does not (and must not try to)
    // replicate that logic in SQL.
    const cortesCooldown = new Date(Date.now() - COOLDOWN_RECORDATORIO_DIAS * 24 * 60 * 60 * 1000);

    const vehiculos = await tenantDb.vehiculo.findMany({
      where: {
        ordenes: { some: { estado: "ENTREGADA", entregadaAt: { not: null } } },
        recordatorios: { none: { enviadoAt: { gte: cortesCooldown } } },
      },
      select: {
        id: true,
        placa: true,
        marca: true,
        modelo: true,
        cliente: { select: { id: true, nombre: true, email: true } },
        // The two newest delivered órdenes: one gives the last service date and
        // odometer, the pair gives the km/day rate the projection needs.
        ordenes: {
          where: { estado: "ENTREGADA", entregadaAt: { not: null } },
          orderBy: { entregadaAt: "desc" },
          take: 2,
          select: { entregadaAt: true, kilometrajeIngreso: true },
        },
        recordatorios: {
          orderBy: { enviadoAt: "desc" },
          take: 1,
          select: { enviadoAt: true },
        },
      },
    });

    return vehiculos.map((vehiculo) => ({
      vehiculoId: vehiculo.id,
      placa: vehiculo.placa,
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      clienteId: vehiculo.cliente.id,
      clienteNombre: vehiculo.cliente.nombre,
      clienteEmail: vehiculo.cliente.email,
      servicios: vehiculo.ordenes.flatMap((orden) =>
        orden.entregadaAt === null
          ? []
          : [{ fecha: orden.entregadaAt, kilometraje: orden.kilometrajeIngreso }],
      ),
      ultimoRecordatorioAt: vehiculo.recordatorios[0]?.enviadoAt ?? null,
    }));
  },

  async registrarRecordatorio(schemaName: string, registro: RegistroRecordatorio): Promise<void> {
    const tenantDb = getTenantDb(schemaName);
    await tenantDb.recordatorioEnviado.create({
      data: {
        vehiculoId: registro.vehiculoId,
        clienteId: registro.clienteId,
        emailDestino: registro.emailDestino,
        // MotivoMantenimiento's values are exactly MotivoRecordatorio's, which
        // is why mantenimiento.ts can stay free of generated Prisma types.
        motivo: registro.motivo,
        enviadoAt: registro.enviadoAt,
      },
    });
  },
};
