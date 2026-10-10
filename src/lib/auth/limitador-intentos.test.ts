import { describe, expect, it } from "vitest";
import { claveIp, crearLimitadorIntentos } from "./limitador-intentos";

describe("crearLimitadorIntentos", () => {
  it("bloquea al llegar a maxFallos dentro de la ventana", () => {
    const limitador = crearLimitadorIntentos({ maxFallos: 3, ventanaMs: 1000 });
    for (let i = 0; i < 3; i++) limitador.registrarFallo("a", 0);

    expect(limitador.estaBloqueado("a", 10)).toBe(true);
    expect(limitador.estaBloqueado("b", 10)).toBe(false);
  });

  it("no bloquea antes de llegar a maxFallos", () => {
    const limitador = crearLimitadorIntentos({ maxFallos: 3, ventanaMs: 1000 });
    limitador.registrarFallo("a", 0);
    limitador.registrarFallo("a", 0);

    expect(limitador.estaBloqueado("a", 10)).toBe(false);
  });

  it("desbloquea cuando la ventana expira", () => {
    const limitador = crearLimitadorIntentos({ maxFallos: 1, ventanaMs: 1000 });
    limitador.registrarFallo("a", 0);

    expect(limitador.estaBloqueado("a", 1001)).toBe(false);
  });

  it("limpiar() reinicia el contador tras un login correcto", () => {
    const limitador = crearLimitadorIntentos({ maxFallos: 2, ventanaMs: 1000 });
    limitador.registrarFallo("a", 0);
    limitador.limpiar("a");
    limitador.registrarFallo("a", 1);

    expect(limitador.estaBloqueado("a", 2)).toBe(false);
  });

  it("no crece sin límite: descarta la clave más antigua al pasar maxClaves", () => {
    const limitador = crearLimitadorIntentos({ maxFallos: 1, ventanaMs: 1000, maxClaves: 2 });
    limitador.registrarFallo("a", 0);
    limitador.registrarFallo("b", 0);
    limitador.registrarFallo("c", 0);

    expect(limitador.estaBloqueado("a", 1)).toBe(false);
    expect(limitador.estaBloqueado("c", 1)).toBe(true);
  });
});

describe("claveIp", () => {
  it("usa CF-Connecting-IP, la IP real que Cloudflare reescribe siempre", () => {
    const request = new Request("http://x", { headers: { "cf-connecting-ip": "1.2.3.4" } });

    expect(claveIp(request)).toBe("1.2.3.4");
  });

  it("ignora X-Forwarded-For: Cloudflare conserva el valor que manda el cliente, así que es falsificable", () => {
    const request = new Request("http://x", {
      headers: { "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "6.6.6.6, 1.2.3.4" },
    });
    const soloXff = new Request("http://x", { headers: { "x-forwarded-for": "6.6.6.6" } });

    expect(claveIp(request)).toBe("1.2.3.4");
    expect(claveIp(soloXff)).toBe("desconocida");
  });

  it("devuelve 'desconocida' sin cabecera o sin request", () => {
    expect(claveIp(new Request("http://x"))).toBe("desconocida");
    expect(claveIp(undefined)).toBe("desconocida");
  });
});
