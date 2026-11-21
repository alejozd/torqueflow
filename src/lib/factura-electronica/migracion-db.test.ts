// src/lib/factura-electronica/migracion-db.test.ts
// Prueba "db": aprovisiona un taller desechable (corre todas las migraciones). Nunca toca taller_dev.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { provisionTenant } from "../../../scripts/provision-tenant";
import { crearFacturaDePrueba } from "./__pruebas__/fixtures-db";

const SLUG = "test-fe-migracion";
const SCHEMA = "test_fe_migracion";

describe("migración de factura electrónica", () => {
  beforeAll(async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });
  });

  afterAll(async () => {
    await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await publicDb.tenant.deleteMany({ where: { slug: SLUG } });
  });

  it("la configuración nace inactiva, simulada, con envío automático y acepta CAIDA_RECIBIDO", async () => {
    const db = getTenantDb(SCHEMA);
    const c = await db.configuracionFacturaElectronica.create({ data: {} });
    expect(c).toMatchObject({
      id: "singleton",
      activa: false,
      envio: "AUTOMATICO",
      ambiente: "SIMULADO",
      cuenta: "BOLSA",
      resultadoSimulado: "ACEPTAR",
      siguienteConsecutivo: 1,
      siguienteConsecutivoNotaCredito: 1,
      tokenCifrado: null,
      ambienteProveedor: null,
    });
    const v = await db.configuracionFacturaElectronica.update({
      where: { id: "singleton" },
      data: { resultadoSimulado: "CAIDA_RECIBIDO", vigenciaHasta: new Date("2027-06-30") },
    });
    expect(v.resultadoSimulado).toBe("CAIDA_RECIBIDO");
    expect(v.vigenciaHasta?.toISOString().slice(0, 10)).toBe("2027-06-30");
  });

  it("el cliente guarda los datos para factura electrónica; sin ellos quedan vacíos", async () => {
    const db = getTenantDb(SCHEMA);
    const empresa = await db.cliente.create({
      data: {
        nombre: "Transportes Andinos SAS",
        documento: "900123456",
        tipoDocumento: "31",
        dv: "8",
        tipoPersona: "JURIDICA",
        responsabilidadFiscal: "O-13",
        municipioCodigo: "05001",
        direccion: "Calle 10 # 20-30",
      },
    });
    expect(empresa).toMatchObject({ tipoDocumento: "31", dv: "8", tipoPersona: "JURIDICA", municipioCodigo: "05001" });
    const sinDatos = await db.cliente.create({ data: { nombre: "Cliente sin datos" } });
    expect(sinDatos).toMatchObject({
      tipoDocumento: null,
      dv: null,
      tipoPersona: null,
      responsabilidadFiscal: null,
      municipioCodigo: null,
      direccion: null,
    });
  });

  it("no deja repetir tipo + prefijo + número; otro tipo con el mismo número sí", async () => {
    const db = getTenantDb(SCHEMA);
    const { facturaId, usuarioId } = await crearFacturaDePrueba(db, "FEM001");
    const datos = {
      tipo: "FACTURA" as const,
      facturaId,
      prefijo: "SETP",
      numero: 990000001,
      payload: {},
      ambiente: "SIMULADO" as const,
      creadoPorId: usuarioId,
    };
    const doc = await db.documentoElectronico.create({ data: datos });
    expect(doc).toMatchObject({ estado: "PENDIENTE", intentos: 0, mensajes: [], cufe: null, xmlRuta: null });
    await expect(db.documentoElectronico.create({ data: datos })).rejects.toMatchObject({ code: "P2002" });
    await expect(
      db.documentoElectronico.create({ data: { ...datos, tipo: "NOTA_CREDITO", documentoReferenciaId: doc.id } }),
    ).resolves.toMatchObject({ documentoReferenciaId: doc.id });
  });
});
