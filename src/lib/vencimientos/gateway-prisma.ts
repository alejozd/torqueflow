import { getTenantDb } from "@/lib/db/tenant-client";
import { prismaRecordatoriosGateway } from "@/lib/recordatorios/gateway-prisma";
import { leerDiasAviso } from "./configuracion";
import type { AvisosGateway, DocumentoParaAviso } from "./ejecutar-avisos";
import type { TipoDocumento } from "./estado-vencimiento";

/**
 * Única pieza con Prisma del barrido de vencimientos. Lecturas a nivel de
 * tenant, sin sede ni sesión (mismo razonamiento que el gateway de
 * recordatorios de mantenimiento).
 */
export const prismaAvisosGateway: AvisosGateway = {
  obtenerConfiguracionSmtp: prismaRecordatoriosGateway.obtenerConfiguracionSmtp,

  async obtenerDiasAviso(schemaName) {
    return leerDiasAviso(getTenantDb(schemaName));
  },

  async listarDocumentosParaAviso(schemaName, desde, hasta) {
    const tenantDb = getTenantDb(schemaName);
    const rango = { gte: desde, lte: hasta };
    const vehiculos = await tenantDb.vehiculo.findMany({
      where: { OR: [{ soatVence: rango }, { tecnomecanicaVence: rango }] },
      select: {
        id: true,
        placa: true,
        soatVence: true,
        tecnomecanicaVence: true,
        cliente: { select: { nombre: true, email: true } },
        avisosVencimiento: {
          where: { canal: "EMAIL" },
          select: { tipo: true, fechaVencimiento: true },
        },
      },
    });

    const documentos: DocumentoParaAviso[] = [];
    for (const vehiculo of vehiculos) {
      const fechas: [TipoDocumento, Date | null][] = [
        ["SOAT", vehiculo.soatVence],
        ["TECNOMECANICA", vehiculo.tecnomecanicaVence],
      ];
      for (const [tipo, fecha] of fechas) {
        if (!fecha || fecha < desde || fecha > hasta) continue;
        documentos.push({
          vehiculoId: vehiculo.id,
          placa: vehiculo.placa,
          clienteNombre: vehiculo.cliente.nombre,
          clienteEmail: vehiculo.cliente.email,
          tipo,
          fechaVencimiento: fecha,
          yaAvisadoPorEmail: vehiculo.avisosVencimiento.some(
            (aviso) => aviso.tipo === tipo && aviso.fechaVencimiento.getTime() === fecha.getTime(),
          ),
        });
      }
    }
    return documentos;
  },

  async registrarAviso(schemaName, registro) {
    const tenantDb = getTenantDb(schemaName);
    const clave = {
      vehiculoId: registro.vehiculoId,
      tipo: registro.tipo,
      fechaVencimiento: registro.fechaVencimiento,
      canal: registro.canal,
    };
    await tenantDb.avisoVencimiento.upsert({
      where: { vehiculoId_tipo_fechaVencimiento_canal: clave },
      create: { ...clave, destino: registro.destino, enviadoPorId: registro.enviadoPorId, enviadoAt: registro.enviadoAt },
      update: { destino: registro.destino, enviadoPorId: registro.enviadoPorId, enviadoAt: registro.enviadoAt },
    });
  },
};
