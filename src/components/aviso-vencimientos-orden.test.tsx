import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvisoVencimientosOrden } from "./aviso-vencimientos-orden";

describe("AvisoVencimientosOrden", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("no muestra nada si todo está vigente o sin dato", () => {
    const { container } = render(
      <AvisoVencimientosOrden soatVence={new Date("2027-05-01T00:00:00Z")} tecnomecanicaVence={null} diasAviso={30} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("avisa vencidos y por vencer", () => {
    render(
      <AvisoVencimientosOrden
        soatVence={new Date("2026-09-12T00:00:00Z")}
        tecnomecanicaVence={new Date("2026-10-20T00:00:00Z")}
        diasAviso={30}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/SOAT vencido el 12\/09\/2026/);
    expect(screen.getByRole("status")).toHaveTextContent(/Revisión técnico-mecánica vence el 20\/10\/2026/);
    expect(screen.getByRole("status")).toHaveTextContent("recuérdaselo al cliente");
  });

  it("concuerda el género de la técnico-mecánica vencida y capitaliza la línea", () => {
    render(
      <AvisoVencimientosOrden soatVence={null} tecnomecanicaVence={new Date("2026-10-01T00:00:00Z")} diasAviso={30} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Revisión técnico-mecánica vencida el 1/10/2026 — recuérdaselo al cliente.",
    );
  });
});
