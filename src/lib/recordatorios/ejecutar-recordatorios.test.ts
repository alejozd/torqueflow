import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  ejecutarRecordatorios,
  type EjecutarRecordatoriosDeps,
  type RecordatoriosGateway,
  type VehiculoParaRecordatorio,
} from "./ejecutar-recordatorios";
import type { ConfiguracionSmtpAlmacenada, SmtpConfigDescifrada } from "@/lib/email/smtp-config";

const AHORA = new Date("2026-08-21T00:00:00Z");

const CONFIG_ALMACENADA: ConfiguracionSmtpAlmacenada = {
  host: "smtp.taller.test",
  puerto: 587,
  usuario: "avisos@taller.test",
  passwordCifrado: "v1:iv:tag:cipher",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
  activo: true,
};

const CONFIG_DESCIFRADA: SmtpConfigDescifrada = {
  host: "smtp.taller.test",
  puerto: 587,
  usuario: "avisos@taller.test",
  password: "clave",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
};

/** Two readings 100 days apart, 5000 km apart => due since 2026-08-09. */
function vehiculoVencido(overrides: Partial<VehiculoParaRecordatorio> = {}): VehiculoParaRecordatorio {
  return {
    vehiculoId: "veh-1",
    placa: "ABC123",
    marca: "Mazda",
    modelo: "3",
    clienteId: "cli-1",
    clienteNombre: "Ana Pérez",
    clienteEmail: "ana@cliente.test",
    servicios: [
      { fecha: new Date("2026-05-01T00:00:00Z"), kilometraje: 65000 },
      { fecha: new Date("2026-01-21T00:00:00Z"), kilometraje: 60000 },
    ],
    ultimoRecordatorioAt: null,
    ...overrides,
  };
}

function vehiculoAlDia(): VehiculoParaRecordatorio {
  return vehiculoVencido({
    vehiculoId: "veh-2",
    placa: "XYZ789",
    servicios: [{ fecha: new Date("2026-08-01T00:00:00Z"), kilometraje: 10000 }],
  });
}

let mockObtenerConfig: Mock;
let mockListarVehiculos: Mock;
let mockRegistrar: Mock;
let mockEnviarEmail: Mock;
let mockDescifrar: Mock;

function construirDeps(
  tenants: { schemaName: string }[] = [{ schemaName: "taller_perez" }],
): EjecutarRecordatoriosDeps {
  const gateway: RecordatoriosGateway = {
    obtenerConfiguracionSmtp: (schema: string) => mockObtenerConfig(schema),
    listarVehiculosParaRecordatorio: (schema: string) => mockListarVehiculos(schema),
    registrarRecordatorio: (schema: string, registro) => mockRegistrar(schema, registro),
  };

  return {
    listarTenants: async () => tenants,
    gateway,
    descifrarConfiguracion: (fila) => mockDescifrar(fila),
    enviarEmail: (config, mensaje) => mockEnviarEmail(config, mensaje),
    ahora: AHORA,
  };
}

beforeEach(() => {
  mockObtenerConfig = vi.fn().mockResolvedValue(CONFIG_ALMACENADA);
  mockListarVehiculos = vi.fn().mockResolvedValue([vehiculoVencido()]);
  mockRegistrar = vi.fn().mockResolvedValue(undefined);
  mockEnviarEmail = vi.fn().mockResolvedValue(undefined);
  mockDescifrar = vi.fn().mockReturnValue(CONFIG_DESCIFRADA);
});

describe("ejecutarRecordatorios", () => {
  it("sends one email per due vehicle and logs it for de-duplication", async () => {
    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).toHaveBeenCalledTimes(1);
    expect(mockEnviarEmail).toHaveBeenCalledWith(
      CONFIG_DESCIFRADA,
      expect.objectContaining({ para: "ana@cliente.test", asunto: "Recordatorio de mantenimiento — ABC123" }),
    );
    expect(mockRegistrar).toHaveBeenCalledWith("taller_perez", {
      vehiculoId: "veh-1",
      clienteId: "cli-1",
      emailDestino: "ana@cliente.test",
      motivo: "KILOMETRAJE",
      enviadoAt: AHORA,
    });
    expect(resumen.enviados).toBe(1);
    expect(resumen.fallidos).toBe(0);
    expect(resumen.tenantsProcesados).toBe(1);
  });

  it("does not email a vehicle that is not due", async () => {
    mockListarVehiculos.mockResolvedValue([vehiculoAlDia()]);

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(resumen.enviados).toBe(0);
    expect(resumen.vehiculosEvaluados).toBe(1);
  });

  it("does not re-send within the cooldown window, and says so in the summary", async () => {
    mockListarVehiculos.mockResolvedValue([
      vehiculoVencido({ ultimoRecordatorioAt: new Date("2026-07-21T00:00:00Z") }),
    ]);

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockRegistrar).not.toHaveBeenCalled();
    expect(resumen.omitidosPorCooldown).toBe(1);
  });

  it("sends again once the cooldown has expired", async () => {
    mockListarVehiculos.mockResolvedValue([
      vehiculoVencido({ ultimoRecordatorioAt: new Date("2026-01-21T00:00:00Z") }),
    ]);

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(resumen.enviados).toBe(1);
    expect(resumen.omitidosPorCooldown).toBe(0);
  });

  it("skips a due vehicle whose cliente has no email address", async () => {
    mockListarVehiculos.mockResolvedValue([vehiculoVencido({ clienteEmail: null })]);

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(resumen.omitidosSinEmail).toBe(1);
  });

  it("skips a tenant with no SMTP configuration without touching its vehicles", async () => {
    mockObtenerConfig.mockResolvedValue(null);

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockListarVehiculos).not.toHaveBeenCalled();
    expect(resumen.tenantsSinSmtp).toBe(1);
    expect(resumen.tenantsProcesados).toBe(0);
  });

  it("skips a tenant that turned reminders off (activo=false)", async () => {
    mockObtenerConfig.mockResolvedValue({ ...CONFIG_ALMACENADA, activo: false });

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockListarVehiculos).not.toHaveBeenCalled();
    expect(resumen.tenantsSinSmtp).toBe(1);
  });

  it("keeps going to the next tenant when one tenant throws", async () => {
    mockObtenerConfig.mockImplementation(async (schema: string) => {
      if (schema === "taller_roto") throw new Error("schema no existe");
      return CONFIG_ALMACENADA;
    });

    const resumen = await ejecutarRecordatorios(
      construirDeps([{ schemaName: "taller_roto" }, { schemaName: "taller_perez" }]),
    );

    expect(resumen.enviados).toBe(1);
    expect(resumen.fallidos).toBe(1);
    expect(resumen.errores[0]).toContain("taller_roto");
  });

  it("keeps going to the next vehicle when one email fails", async () => {
    mockListarVehiculos.mockResolvedValue([
      vehiculoVencido({ vehiculoId: "veh-a", placa: "AAA111" }),
      vehiculoVencido({ vehiculoId: "veh-b", placa: "BBB222" }),
    ]);
    mockEnviarEmail.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).toHaveBeenCalledTimes(2);
    expect(resumen.enviados).toBe(1);
    expect(resumen.fallidos).toBe(1);
    expect(resumen.errores[0]).toContain("AAA111");
  });

  it("does not log a reminder that failed to send, so the next run retries it", async () => {
    mockEnviarEmail.mockRejectedValue(new Error("ECONNREFUSED"));

    await ejecutarRecordatorios(construirDeps());

    expect(mockRegistrar).not.toHaveBeenCalled();
  });

  it("counts a tenant whose SMTP password cannot be decrypted as failed, not as sent", async () => {
    mockDescifrar.mockImplementation(() => {
      throw new Error("clave maestra rotada");
    });

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(resumen.fallidos).toBe(1);
    expect(resumen.enviados).toBe(0);
  });

  it("never lets an error message carry the decrypted SMTP password", async () => {
    mockEnviarEmail.mockRejectedValue(new Error(`fallo con la clave ${CONFIG_DESCIFRADA.password}`));

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(resumen.errores.join(" ")).not.toContain(CONFIG_DESCIFRADA.password);
  });

  it("returns zeroes and does not throw when there are no tenants at all", async () => {
    const resumen = await ejecutarRecordatorios(construirDeps([]));

    expect(resumen).toEqual({
      tenantsProcesados: 0,
      tenantsSinSmtp: 0,
      vehiculosEvaluados: 0,
      enviados: 0,
      omitidosPorCooldown: 0,
      omitidosSinEmail: 0,
      fallidos: 0,
      errores: [],
    });
  });
});
