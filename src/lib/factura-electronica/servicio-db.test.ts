// src/lib/factura-electronica/servicio-db.test.ts
// Prueba "db": aprovisiona un taller desechable (10-20 s). Nunca toca taller_dev ni producción.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  crearProveedorSimulado,
  traducirMensajesDian,
  type FacturaVenta,
  type MemoriaSimulado,
  type MensajeDian,
  type ProveedorFacturaElectronica,
} from "@/modulos/factura-electronica";
import type { Prisma } from "@/generated/prisma-tenant";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { provisionTenant } from "../../../scripts/provision-tenant";
import { crearFacturaDePrueba } from "./__pruebas__/fixtures-db";
import { emitirDocumentoFactura, emitirTrasFacturar, reintentarDocumento, type ContextoFe } from "./servicio";

const SLUG = "test-fe-servicio";
const SCHEMA = "test_fe_servicio";
const db = getTenantDb(SCHEMA);
/** 10:00:00 del 20 de noviembre en Bogotá. */
const AHORA = new Date("2026-11-20T15:00:00Z");
let usuarioId = "";
let uploadsDir = "";
const uploadsOriginal = process.env.UPLOADS_DIR;

async function configurar(datos: Partial<Prisma.ConfiguracionFacturaElectronicaCreateInput> = {}) {
  const base = {
    activa: true,
    envio: "AUTOMATICO",
    ambiente: "SIMULADO",
    resultadoSimulado: "ACEPTAR",
    nit: "901000123",
    razonSocial: "Taller de Prueba SAS",
    resolucionNumero: "18760000001",
    prefijo: "SETP",
    rangoDesde: 990000000,
    rangoHasta: 995000000,
    vigenciaDesde: new Date("2026-01-01"),
    vigenciaHasta: new Date("2027-12-31"),
  } satisfies Partial<Prisma.ConfiguracionFacturaElectronicaCreateInput>;
  await db.configuracionFacturaElectronica.upsert({
    where: { id: "singleton" },
    create: { ...base, ...datos },
    update: { ...base, ...datos },
  });
}

function ctx(proveedor: ProveedorFacturaElectronica, ahora: Date = AHORA): ContextoFe {
  return { db, tenantSchema: SCHEMA, usuarioId, ahora: () => ahora, proveedor };
}

const docDe = (facturaId: string) => db.documentoElectronico.findFirstOrThrow({ where: { facturaId, tipo: "FACTURA" } });
const mensajesDe = (valor: unknown) => valor as MensajeDian[];

describe("servicio de factura electrónica", () => {
  beforeAll(async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });
    uploadsDir = await mkdtemp(path.join(tmpdir(), "torqueflow-fe-servicio-"));
    process.env.UPLOADS_DIR = uploadsDir;
    usuarioId = (await crearFacturaDePrueba(db, "FES000")).usuarioId;
  });

  afterAll(async () => {
    process.env.UPLOADS_DIR = uploadsOriginal;
    await rm(uploadsDir, { recursive: true, force: true });
    await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await publicDb.tenant.deleteMany({ where: { slug: SLUG } });
  });

  beforeEach(async () => {
    await configurar();
  });

  it("acepta, guarda CUFE y archivos, congela fecha y hora y avanza el consecutivo", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES001");
    const r = await emitirDocumentoFactura(ctx(crearProveedorSimulado()), facturaId);
    expect(r).toMatchObject({ ok: true, estado: "ACEPTADO" });

    const doc = await docDe(facturaId);
    expect(doc.cufe).toMatch(/^[0-9a-f]{96}$/);
    expect(doc.numero).toBeGreaterThanOrEqual(990000000);
    expect(doc.intentos).toBe(1);
    expect(doc.payload as unknown as FacturaVenta).toMatchObject({ prefijo: "SETP", numero: doc.numero, fecha: "2026-11-20", hora: "10:00:00" });
    expect(doc.xmlRuta).toBe(`/api/uploads/${SCHEMA}/facturas-electronicas/${doc.id}/FES-SETP${doc.numero}.xml`);
    expect(doc.pdfRuta).toBe(`/api/uploads/${SCHEMA}/facturas-electronicas/${doc.id}/FES-SETP${doc.numero}.pdf`);
    const config = await db.configuracionFacturaElectronica.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(config.siguienteConsecutivo).toBe(doc.numero + 1);
  });

  it("con datos incompletos no gasta número ni llama al proveedor", async () => {
    const { facturaId, clienteId } = await crearFacturaDePrueba(db, "FES002");
    await db.cliente.update({ where: { id: clienteId }, data: { tipoPersona: "JURIDICA" } });
    const antes = await db.configuracionFacturaElectronica.findUniqueOrThrow({ where: { id: "singleton" } });
    const proveedor = crearProveedorSimulado();
    const enviar = vi.spyOn(proveedor, "enviar");

    const r = await emitirDocumentoFactura(ctx(proveedor), facturaId);

    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
    if (!r.ok) {
      expect(r.errores.map((e) => e.campo)).toEqual(
        expect.arrayContaining(["cliente.tipoDocumento", "adquirente.municipioDane", "adquirente.direccion"]),
      );
    }
    expect(enviar).not.toHaveBeenCalled();
    expect(await db.documentoElectronico.count({ where: { facturaId } })).toBe(0);
    const despues = await db.configuracionFacturaElectronica.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(despues.siguienteConsecutivo).toBe(antes.siguienteConsecutivo);
  });

  it("un rechazo guarda los motivos y el reintento usa el mismo número y la misma fecha", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES003");
    const memoria: MemoriaSimulado = new Map();
    const r1 = await emitirDocumentoFactura(ctx(crearProveedorSimulado({ resultado: "RECHAZAR", memoria })), facturaId);
    expect(r1).toMatchObject({ ok: true, estado: "RECHAZADO" });
    const rechazado = await docDe(facturaId);
    expect(mensajesDe(rechazado.mensajes)[0].codigo).toBe("FAU14");

    const manana = new Date("2026-11-21T15:00:00Z");
    const r2 = await reintentarDocumento(ctx(crearProveedorSimulado({ memoria }), manana), rechazado.id);
    expect(r2).toMatchObject({ ok: true, estado: "ACEPTADO" });
    const aceptado = await docDe(facturaId);
    expect(aceptado.numero).toBe(rechazado.numero);
    expect((aceptado.payload as unknown as FacturaVenta).fecha).toBe("2026-11-20");
    expect(aceptado.intentos).toBe(2);
  });

  it("caída con recibo: queda POR_CONFIRMAR y el reintento recupera el CUFE del histórico sin reenviar", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES004");
    const memoria: MemoriaSimulado = new Map();
    const r1 = await emitirDocumentoFactura(ctx(crearProveedorSimulado({ resultado: "CAIDA_RECIBIDO", memoria })), facturaId);
    expect(r1).toMatchObject({ ok: true, estado: "POR_CONFIRMAR" });
    const doc = await docDe(facturaId);

    const proveedor = crearProveedorSimulado({ memoria });
    const enviar = vi.spyOn(proveedor, "enviar");
    const r2 = await reintentarDocumento(ctx(proveedor), doc.id);

    expect(r2).toMatchObject({ ok: true, estado: "ACEPTADO" });
    expect(enviar).not.toHaveBeenCalled();
    expect((await docDe(facturaId)).cufe).toBe(memoria.get(`FACTURA:SETP${doc.numero}`)?.cufe);
  });

  it("Regla 90: con el mismo total adopta el CUFE del histórico; con otro total avisa un choque", async () => {
    const regla90 = traducirMensajesDian("Regla: 90, Rechazo: Documento procesado anteriormente.");
    const conHistorico = (total: number): ProveedorFacturaElectronica => ({
      ...crearProveedorSimulado(),
      enviar: async () => ({ estado: "RECHAZADO", motivos: regla90 }),
      buscarEmitido: async () => ({ estado: "ENCONTRADO", cufe: "cufe-del-historico", total }),
    });

    const a = await crearFacturaDePrueba(db, "FES005");
    expect(await emitirDocumentoFactura(ctx(conHistorico(11900000)), a.facturaId)).toMatchObject({ ok: true, estado: "ACEPTADO" });
    expect((await docDe(a.facturaId)).cufe).toBe("cufe-del-historico");

    const b = await crearFacturaDePrueba(db, "FES006");
    expect(await emitirDocumentoFactura(ctx(conHistorico(100)), b.facturaId)).toMatchObject({ ok: true, estado: "POR_CONFIRMAR" });
    const choque = await docDe(b.facturaId);
    expect(choque.cufe).toBeNull();
    expect(mensajesDe(choque.mensajes)[0].explicacion).toMatch(/choque de numeración/);
  });

  it("token inválido: queda PENDIENTE (seguro no llegó a la DIAN)", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES007");
    const proveedor: ProveedorFacturaElectronica = {
      ...crearProveedorSimulado(),
      enviar: async () => ({ estado: "ERROR_CONFIGURACION", mensaje: "La conexión con el proveedor no es válida." }),
    };
    expect(await emitirDocumentoFactura(ctx(proveedor), facturaId)).toMatchObject({ ok: true, estado: "PENDIENTE" });
  });

  it("si el ambiente del proveedor no coincide con el del taller no envía y deja PENDIENTE", async () => {
    await configurar({ ambiente: "PRUEBAS" });
    const { facturaId } = await crearFacturaDePrueba(db, "FES008");
    const enviar = vi.fn();
    const proveedor: ProveedorFacturaElectronica = {
      ...crearProveedorSimulado(),
      enviar,
      probarConexion: async () => ({ ok: true, ambiente: "PRODUCCION" }),
    };

    const r = await emitirDocumentoFactura(ctx(proveedor), facturaId);

    expect(r).toMatchObject({ ok: true, estado: "PENDIENTE" });
    if (r.ok) expect(r.mensajes[0].explicacion).toMatch(/ambiente de producción/);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("si el total electrónico difiere un centavo, la factura interna se ajusta al documento", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES009", { valor: 11900.03 });
    expect(await emitirDocumentoFactura(ctx(crearProveedorSimulado()), facturaId)).toMatchObject({ ok: true, estado: "ACEPTADO" });
    const f = await db.factura.findUniqueOrThrow({ where: { id: facturaId } });
    expect(Number(f.total)).toBe(11900.02);
    expect(Number(f.subtotal)).toBe(11900.02);
    expect(Number(f.saldoPendiente)).toBe(11900.02);
    expect(Number(f.iva)).toBe(1900);
  });

  it("envíos concurrentes reciben números consecutivos sin huecos", async () => {
    const ids: string[] = [];
    for (const placa of ["FES010", "FES011", "FES012", "FES013"]) ids.push((await crearFacturaDePrueba(db, placa)).facturaId);
    const proveedor = crearProveedorSimulado();

    const resultados = await Promise.all(ids.map((id) => emitirDocumentoFactura(ctx(proveedor), id)));

    expect(resultados.every((r) => r.ok && r.estado === "ACEPTADO")).toBe(true);
    const docs = await db.documentoElectronico.findMany({ where: { facturaId: { in: ids } }, orderBy: { numero: "asc" } });
    const numeros = docs.map((d) => d.numero);
    expect(numeros).toEqual([numeros[0], numeros[0] + 1, numeros[0] + 2, numeros[0] + 3]);
    const config = await db.configuracionFacturaElectronica.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(config.siguienteConsecutivo).toBe(numeros[3] + 1);
  });

  it("la misma factura enviada dos veces a la vez crea un solo documento", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES014");
    const proveedor = crearProveedorSimulado();

    const resultados = await Promise.all([
      emitirDocumentoFactura(ctx(proveedor), facturaId),
      emitirDocumentoFactura(ctx(proveedor), facturaId),
    ]);

    expect(await db.documentoElectronico.count({ where: { facturaId } })).toBe(1);
    expect(resultados.some((r) => r.ok && r.estado === "ACEPTADO")).toBe(true);
  });

  it("emitirTrasFacturar solo actúa con la configuración activa y envío automático", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES015");
    await configurar({ envio: "MANUAL" });
    expect(await emitirTrasFacturar(ctx(crearProveedorSimulado()), facturaId)).toBeNull();
    await configurar({ activa: false });
    expect(await emitirTrasFacturar(ctx(crearProveedorSimulado()), facturaId)).toBeNull();
    expect(await db.documentoElectronico.count({ where: { facturaId } })).toBe(0);

    await configurar();
    expect(await emitirTrasFacturar(ctx(crearProveedorSimulado()), facturaId)).toMatchObject({ ok: true, estado: "ACEPTADO" });
  });
});
