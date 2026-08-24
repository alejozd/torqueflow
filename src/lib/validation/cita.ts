import { z } from "zod";

/**
 * The <input type="datetime-local"> value ("2026-09-01T10:30") is validated and
 * converted by hand rather than with z.coerce.date(). z.coerce.date()'s custom
 * error parameter changed shape across zod 4 minors, and this project has
 * already been bitten once by a zod message regression (see the ledger's Fase 3
 * `?? ""` note); Date.parse + refine + transform is version-proof and keeps the
 * Spanish message under our control.
 *
 * clienteId is NOT part of this schema on purpose: the action derives it from
 * the chosen vehículo, so a caller cannot post a vehículo belonging to one
 * cliente together with a different cliente's id.
 */
export const citaInputSchema = z.object({
  vehiculoId: z.string().min(1, "Selecciona un vehículo"),
  fechaHora: z
    .string()
    .min(1, "La fecha y hora son obligatorias")
    .refine((valor) => !Number.isNaN(Date.parse(valor)), "La fecha y hora no son válidas")
    .transform((valor) => new Date(valor)),
  motivo: z.string().min(1, "El motivo es obligatorio"),
  notas: z.string().optional().or(z.literal("")),
});

export type CitaInput = z.infer<typeof citaInputSchema>;

/** Mirrors the EstadoCita enum in prisma/tenant/schema.prisma. */
export const estadoCitaSchema = z.enum(["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA"], {
  message: "Estado de cita inválido",
});

export type EstadoCitaInput = z.infer<typeof estadoCitaSchema>;
