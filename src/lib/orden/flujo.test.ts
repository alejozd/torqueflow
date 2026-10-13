import { describe, expect, it } from "vitest";
import {
  ETIQUETA_ALERTA,
  ETIQUETA_PRIORIDAD,
  ORDEN_PRIORIDAD,
  alertaDeOrden,
  compararPorPrioridad,
  diasSinActividad,
  ultimaActividad,
  type ActividadDeOrden,
} from "./flujo";

const AHORA = new Date("2026-10-16T15:00:00.000Z");
const haceDias = (dias: number, horas = 0) =>
  new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000 - horas * 60 * 60 * 1000);

function orden(cambios: Partial<ActividadDeOrden> = {}): ActividadDeOrden {
  return {
    estado: "EN_PROCESO",
    createdAt: haceDias(10),
    updatedAt: haceDias(10),
    items: [],
    manoDeObra: [],
    dvi: null,
    danios: [],
    ...cambios,
  };
}

describe("ultimaActividad", () => {
  it("toma el momento más reciente entre la cabecera y lo cargado", () => {
    const conTrabajo = orden({
      updatedAt: haceDias(9),
      items: [{ createdAt: haceDias(1) }],
      manoDeObra: [{ createdAt: haceDias(4) }],
      dvi: { updatedAt: haceDias(6), fotos: [{ createdAt: haceDias(2) }] },
      danios: [{ createdAt: haceDias(8) }],
    });

    expect(ultimaActividad(conTrabajo)).toEqual(haceDias(1));
  });

  it("sin hijos usa la cabecera", () => {
    expect(ultimaActividad(orden({ createdAt: haceDias(5), updatedAt: haceDias(3) }))).toEqual(haceDias(3));
  });
});

describe("diasSinActividad", () => {
  it("cuenta días completos y nunca es negativo", () => {
    expect(diasSinActividad(orden({ updatedAt: haceDias(3) }), AHORA)).toBe(3);
    expect(diasSinActividad(orden({ updatedAt: haceDias(0, 23) }), AHORA)).toBe(0);
    expect(diasSinActividad(orden({ updatedAt: haceDias(2, 23) }), AHORA)).toBe(2);
    expect(diasSinActividad(orden({ updatedAt: haceDias(-2) }), AHORA)).toBe(0);
  });
});

describe("alertaDeOrden", () => {
  const UMBRAL = { ahora: AHORA, diasUmbral: 3 };

  it("una orden en proceso sin actividad en el umbral está estancada", () => {
    expect(alertaDeOrden(orden({ updatedAt: haceDias(3) }), UMBRAL)).toBe("ESTANCADA");
    expect(alertaDeOrden(orden({ updatedAt: haceDias(9) }), UMBRAL)).toBe("ESTANCADA");
  });

  it("un día antes del umbral todavía no alerta", () => {
    expect(alertaDeOrden(orden({ updatedAt: haceDias(2, 23) }), UMBRAL)).toBeNull();
  });

  it("cargar trabajo reciente la saca de la alerta aunque la cabecera esté vieja", () => {
    const conRepuesto = orden({ updatedAt: haceDias(20), items: [{ createdAt: haceDias(0, 2) }] });

    expect(alertaDeOrden(conRepuesto, UMBRAL)).toBeNull();
  });

  it("una orden terminada sin entregar alerta distinto", () => {
    expect(alertaDeOrden(orden({ estado: "TERMINADA", updatedAt: haceDias(4) }), UMBRAL)).toBe("TERMINADA_SIN_ENTREGAR");
  });

  it("borradores, entregadas y anuladas no alertan", () => {
    expect(alertaDeOrden(orden({ estado: "BORRADOR", updatedAt: haceDias(30) }), UMBRAL)).toBeNull();
    expect(alertaDeOrden(orden({ estado: "ENTREGADA", updatedAt: haceDias(30) }), UMBRAL)).toBeNull();
    expect(alertaDeOrden(orden({ estado: "ANULADA", updatedAt: haceDias(30) }), UMBRAL)).toBeNull();
  });

  it("con un umbral mayor exige más días", () => {
    const contexto = { ahora: AHORA, diasUmbral: 10 };

    expect(alertaDeOrden(orden({ updatedAt: haceDias(9) }), contexto)).toBeNull();
    expect(alertaDeOrden(orden({ updatedAt: haceDias(10) }), contexto)).toBe("ESTANCADA");
  });
});

describe("prioridad", () => {
  it("etiqueta los cuatro niveles y los pesa de urgente a baja", () => {
    expect(ETIQUETA_PRIORIDAD).toEqual({ BAJA: "Baja", NORMAL: "Normal", ALTA: "Alta", URGENTE: "Urgente" });
    expect(ORDEN_PRIORIDAD.URGENTE).toBeLessThan(ORDEN_PRIORIDAD.ALTA);
    expect(ORDEN_PRIORIDAD.ALTA).toBeLessThan(ORDEN_PRIORIDAD.NORMAL);
    expect(ORDEN_PRIORIDAD.NORMAL).toBeLessThan(ORDEN_PRIORIDAD.BAJA);
  });

  it("ordena por prioridad y desempata por antigüedad", () => {
    const urgente = { prioridad: "URGENTE" as const, createdAt: haceDias(1) };
    const normalVieja = { prioridad: "NORMAL" as const, createdAt: haceDias(9) };
    const normalNueva = { prioridad: "NORMAL" as const, createdAt: haceDias(2) };

    expect([normalVieja, urgente].sort(compararPorPrioridad)).toEqual([urgente, normalVieja]);
    expect([normalNueva, normalVieja].sort(compararPorPrioridad)).toEqual([normalVieja, normalNueva]);
  });

  it("etiqueta los dos motivos de alerta", () => {
    expect(ETIQUETA_ALERTA.ESTANCADA).toBe("Estancada");
    expect(ETIQUETA_ALERTA.TERMINADA_SIN_ENTREGAR).toBe("Terminada sin entregar");
  });
});
