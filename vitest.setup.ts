import "dotenv/config";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// El selector de IVA (components/selector-iva.tsx) carga las tarifas con una
// server action; sin esto cada formulario que lo usa arrastraría la sesión de
// next-auth al test. Las tarifas por defecto de un taller nuevo. El test de las
// propias acciones hace vi.unmock para probar el módulo real.
vi.mock("@/app/actions/tarifa-iva-actions", () => ({
  listTarifasIva: vi.fn().mockResolvedValue([
    { id: "tarifa_iva_0", porcentaje: 0, nombre: "Exento", activa: true, predeterminada: false },
    { id: "tarifa_iva_5", porcentaje: 5, nombre: "Reducida", activa: true, predeterminada: false },
    { id: "tarifa_iva_19", porcentaje: 19, nombre: "General", activa: true, predeterminada: true },
  ]),
  crearTarifaIvaAction: vi.fn(),
  renombrarTarifaIvaAction: vi.fn(),
  cambiarActivaTarifaIvaAction: vi.fn(),
  marcarPredeterminadaTarifaIvaAction: vi.fn(),
}));
