import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KPI_TONE, KpiCard } from "./kpi-card";

describe("KPI_TONE", () => {
  it("keeps the existing tones used across Facturas/Ordenes/Citas unchanged", () => {
    expect(KPI_TONE.info).toMatchObject({
      cardBg: "bg-blue-50 dark:bg-blue-500/10",
      iconBg: "bg-blue-100 dark:bg-blue-500/20",
      icon: "text-blue-600 dark:text-blue-400",
    });
    expect(KPI_TONE.warning).toMatchObject({
      cardBg: "bg-orange-50 dark:bg-orange-500/10",
      iconBg: "bg-orange-100 dark:bg-orange-500/20",
      icon: "text-orange-600 dark:text-orange-400",
    });
    expect(KPI_TONE.success).toMatchObject({
      cardBg: "bg-green-50 dark:bg-green-500/10",
      iconBg: "bg-green-100 dark:bg-green-500/20",
      icon: "text-green-600 dark:text-green-400",
    });
    expect(KPI_TONE.danger).toMatchObject({
      cardBg: "bg-red-50 dark:bg-red-500/10",
      iconBg: "bg-red-100 dark:bg-red-500/20",
      icon: "text-red-600 dark:text-red-400",
    });
    expect(KPI_TONE.neutral).toMatchObject({
      cardBg: "bg-gray-50 dark:bg-gray-500/10",
      iconBg: "bg-gray-100 dark:bg-gray-500/20",
      icon: "text-gray-600 dark:text-gray-400",
    });
  });

  it("adds a purple tone for people/user-centric KPIs, following the same cardBg/iconBg/icon shape", () => {
    expect(KPI_TONE.purple).toMatchObject({
      cardBg: "bg-purple-50 dark:bg-purple-500/10",
      iconBg: "bg-purple-100 dark:bg-purple-500/20",
      icon: "text-purple-600 dark:text-purple-400",
    });
  });
});

describe("KpiCard", () => {
  it("un título de una sola palabra larga se parte antes que cortarse (VENCIMIENTOS en un portátil)", () => {
    render(<KpiCard title="Vencimientos" value={3} icon={<span />} />);

    const titulo = screen.getByText("Vencimientos");
    // min-w-0 deja que el título ceda espacio al ícono; break-words lo parte si aun así no cabe.
    expect(titulo).toHaveClass("min-w-0", "break-words");
  });

  it("ocupa todo el alto de su celda, aunque vaya dentro de un enlace (Cartera, Vencimientos)", () => {
    render(
      <a href="/cartera">
        <KpiCard title="Cartera" value="$ 1" icon={<span />} />
      </a>,
    );

    // Sin h-full, la tarjeta dentro del enlace quedaba más baja que sus vecinas de la fila.
    expect(screen.getByText("Cartera").closest('[data-slot="card"]')).toHaveClass("h-full");
  });
});
