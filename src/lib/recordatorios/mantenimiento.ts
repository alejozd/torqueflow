/**
 * When is a vehicle due for preventive maintenance?
 *
 * The rule, fixed in code and NOT configurable per tenant: 5000 km OR 6 months
 * since the last delivered service, whichever comes first. Both are implemented
 * as due *dates* and the earlier one wins, so "whichever comes first" is literal
 * rather than an if/else that happens to check km before time.
 *
 * The signal is the delivered OrdenTrabajo (estado ENTREGADA, ordered by
 * entregadaAt), not HistorialVehiculo: HistorialVehiculo is free text with no
 * service-type field and a `fecha` defaulting to now(), so a note typed months
 * after the fact is indistinguishable from an actual service. The delivered
 * orden is also the row carrying kilometrajeIngreso, so both halves of the rule
 * read one consistent source.
 *
 * No model stores a vehicle's current odometer, so the km half is a projection:
 * from the two newest readings we derive km/day and compute the date the
 * vehicle reaches +5000 km. With fewer than two readings, a missing reading, a
 * same-day pair, or a non-positive rate, the km branch simply does not fire and
 * only the 6-month branch applies.
 *
 * Deliberately Prisma-free and I/O-free, like src/lib/sede/scope.ts: the whole
 * rule is auditable and testable without a database. `ahora` is a parameter,
 * never `new Date()` inside, so every test is deterministic.
 */
export const UMBRAL_KM = 5000;
export const UMBRAL_MESES = 6;
export const COOLDOWN_RECORDATORIO_DIAS = 90;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** "KILOMETRAJE" | "TIEMPO" matches the MotivoRecordatorio Prisma enum by value,
 *  which lets the gateway assign it directly without importing generated types. */
export type MotivoMantenimiento = "KILOMETRAJE" | "TIEMPO";

export interface LecturaServicio {
  /** entregadaAt of a delivered orden. */
  fecha: Date;
  /** kilometrajeIngreso of that same orden; null when it was never recorded. */
  kilometraje: number | null;
}

export interface EvaluacionMantenimiento {
  vencido: boolean;
  motivo: MotivoMantenimiento | null;
  fechaVencimiento: Date | null;
  bloqueadoPorCooldown: boolean;
}

export function sumarMeses(fecha: Date, meses: number): Date {
  const resultado = new Date(fecha.getTime());
  const diaOriginal = resultado.getUTCDate();
  resultado.setUTCMonth(resultado.getUTCMonth() + meses);
  // Aug 31 + 6 months would roll into March; clamp back to the last day of the
  // intended month instead of silently landing in the following one.
  if (resultado.getUTCDate() < diaOriginal) {
    resultado.setUTCDate(0);
  }
  return resultado;
}

function fechaVencimientoPorKilometraje(servicios: LecturaServicio[]): Date | null {
  const [ultimo, anterior] = servicios;
  if (!ultimo || !anterior) return null;
  if (ultimo.kilometraje === null || anterior.kilometraje === null) return null;

  const dias = (ultimo.fecha.getTime() - anterior.fecha.getTime()) / MS_POR_DIA;
  if (dias < 1) return null;

  const kmRecorridos = ultimo.kilometraje - anterior.kilometraje;
  if (kmRecorridos <= 0) return null;

  const kmPorDia = kmRecorridos / dias;
  const diasHastaUmbral = UMBRAL_KM / kmPorDia;
  return new Date(ultimo.fecha.getTime() + diasHastaUmbral * MS_POR_DIA);
}

/**
 * @param servicios delivered services, MOST RECENT FIRST, at most two.
 * @param ultimoRecordatorioAt when the newest reminder for this vehicle was sent.
 * @param ahora the evaluation instant (injected, never read from the clock here).
 */
export function evaluarMantenimiento(
  servicios: LecturaServicio[],
  ultimoRecordatorioAt: Date | null,
  ahora: Date,
): EvaluacionMantenimiento {
  const ultimo = servicios[0];
  if (!ultimo) {
    return { vencido: false, motivo: null, fechaVencimiento: null, bloqueadoPorCooldown: false };
  }

  const fechaTiempo = sumarMeses(ultimo.fecha, UMBRAL_MESES);
  const fechaKm = fechaVencimientoPorKilometraje(servicios);

  const usaKm = fechaKm !== null && fechaKm.getTime() < fechaTiempo.getTime();
  const fechaVencimiento = usaKm ? (fechaKm as Date) : fechaTiempo;
  const motivoCandidato: MotivoMantenimiento = usaKm ? "KILOMETRAJE" : "TIEMPO";

  const vencido = fechaVencimiento.getTime() <= ahora.getTime();

  const bloqueadoPorCooldown =
    ultimoRecordatorioAt !== null &&
    ahora.getTime() - ultimoRecordatorioAt.getTime() < COOLDOWN_RECORDATORIO_DIAS * MS_POR_DIA;

  return {
    vencido,
    motivo: vencido ? motivoCandidato : null,
    fechaVencimiento,
    bloqueadoPorCooldown,
  };
}
