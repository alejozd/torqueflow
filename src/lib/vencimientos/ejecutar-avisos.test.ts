import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  ejecutarAvisosVencimiento,
  type AvisosGateway,
  type DocumentoParaAviso,
  type EjecutarAvisosDeps,
} from "./ejecutar-avisos";
import type { ConfiguracionSmtpAlmacenada, SmtpConfigDescifrada } from "@/lib/email/smtp-config";

const AHORA = new Date("2026-10-10T15:00:00Z");
const CONFIG: ConfiguracionSmtpAlmacenada = {
  host: "smtp.taller.test", puerto: 587, usuario: "avisos@taller.test", passwordCifrado: "v1:iv:tag:cipher",
  fromEmail: "avisos@taller.test", fromNombre: "Taller Pérez", activo: true,
};
const DESCIFRADA: SmtpConfigDescifrada = {
  host: "smtp.taller.test", puerto: 587, usuario: "avisos@taller.test", password: "clave",
  fromEmail: "avisos@taller.test", fromNombre: "Taller Pérez",
};

function documento(overrides: Partial<DocumentoParaAviso> = {}): DocumentoParaAviso {
  return {
    vehiculoId: "veh-1", placa: "ABC123", clienteNombre: "Ana", clienteEmail: "ana@cliente.test",
    tipo: "SOAT", fechaVencimiento: new Date("2026-10-20T00:00:00Z"), yaAvisadoPorEmail: false, ...overrides,
  };
}

let gateway: { [K in keyof AvisosGateway]: Mock };
let deps: EjecutarAvisosDeps;

beforeEach(() => {
  gateway = {
    obtenerConfiguracionSmtp: vi.fn().mockResolvedValue(CONFIG),
    obtenerDiasAviso: vi.fn().mockResolvedValue(30),
    listarDocumentosParaAviso: vi.fn().mockResolvedValue([documento()]),
    registrarAviso: vi.fn().mockResolvedValue(undefined),
  };
  deps = {
    listarTenants: vi.fn().mockResolvedValue([{ schemaName: "taller_perez" }]),
    gateway: gateway as unknown as AvisosGateway,
    descifrarConfiguracion: vi.fn().mockReturnValue(DESCIFRADA),
    enviarEmail: vi.fn().mockResolvedValue(undefined),
    ahora: AHORA,
  };
});

describe("ejecutarAvisosVencimiento", () => {
  it("envía y registra un aviso EMAIL por documento por vencer", async () => {
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.enviados).toBe(1);
    expect(deps.enviarEmail).toHaveBeenCalledTimes(1);
    expect(gateway.registrarAviso).toHaveBeenCalledWith("taller_perez", {
      vehiculoId: "veh-1", tipo: "SOAT", fechaVencimiento: new Date("2026-10-20T00:00:00Z"),
      canal: "EMAIL", destino: "ana@cliente.test", enviadoPorId: null, enviadoAt: AHORA,
    });
  });

  it("consulta la ventana [hoy-30, hoy+diasAviso]", async () => {
    gateway.obtenerDiasAviso.mockResolvedValue(15);
    await ejecutarAvisosVencimiento(deps);
    expect(gateway.listarDocumentosParaAviso).toHaveBeenCalledWith(
      "taller_perez", new Date("2026-09-10T00:00:00Z"), new Date("2026-10-25T00:00:00Z"),
    );
  });

  it("salta tenants sin SMTP o con SMTP inactivo", async () => {
    gateway.obtenerConfiguracionSmtp.mockResolvedValue({ ...CONFIG, activo: false });
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.tenantsSinSmtp).toBe(1);
    expect(deps.enviarEmail).not.toHaveBeenCalled();
  });

  it("omite documentos ya avisados por email y clientes sin email", async () => {
    gateway.listarDocumentosParaAviso.mockResolvedValue([
      documento({ yaAvisadoPorEmail: true }),
      documento({ vehiculoId: "veh-2", clienteEmail: null }),
    ]);
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.omitidosYaAvisados).toBe(1);
    expect(r.omitidosSinEmail).toBe(1);
    expect(deps.enviarEmail).not.toHaveBeenCalled();
  });

  it("ignora documentos fuera de la ventana aunque el gateway los devuelva", async () => {
    gateway.listarDocumentosParaAviso.mockResolvedValue([
      documento({ fechaVencimiento: new Date("2026-12-31T00:00:00Z") }),
      documento({ vehiculoId: "veh-3", fechaVencimiento: new Date("2026-08-01T00:00:00Z") }),
    ]);
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.enviados).toBe(0);
  });

  it("un envío fallido no se registra y cuenta como fallido", async () => {
    (deps.enviarEmail as Mock).mockRejectedValue(new TypeError("smtp caído"));
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.fallidos).toBe(1);
    expect(gateway.registrarAviso).not.toHaveBeenCalled();
    expect(r.errores[0]).toContain("TypeError");
    expect(r.errores[0]).not.toContain("smtp caído");
  });

  it("enviado pero no registrado tras reintento => enviadosNoRegistrados", async () => {
    gateway.registrarAviso.mockRejectedValue(new Error("db"));
    const r = await ejecutarAvisosVencimiento(deps);
    expect(gateway.registrarAviso).toHaveBeenCalledTimes(2);
    expect(r.enviados).toBe(1);
    expect(r.enviadosNoRegistrados).toBe(1);
    expect(r.fallidos).toBe(0);
  });

  it("un tenant que falla no aborta los demás", async () => {
    (deps.listarTenants as Mock).mockResolvedValue([{ schemaName: "roto" }, { schemaName: "taller_perez" }]);
    gateway.obtenerConfiguracionSmtp.mockImplementation(async (schema: string) => {
      if (schema === "roto") throw new Error("x");
      return CONFIG;
    });
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.fallidos).toBe(1);
    expect(r.enviados).toBe(1);
  });
});
