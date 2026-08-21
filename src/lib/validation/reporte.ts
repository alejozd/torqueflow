import { z } from "zod";

/**
 * Round-trip check instead of a bare `Number.isNaN(date.getTime())`: it holds
 * regardless of how lenient the host's Date parser is about out-of-range
 * components, so "2026-02-31" is rejected even if a runtime silently rolls it
 * over to March 3rd.
 */
function esFechaDeCalendario(valor: string): boolean {
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) return false;
  return fecha.toISOString().slice(0, 10) === valor;
}

const fechaSchema = z
  .string({ error: "La fecha es obligatoria" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato AAAA-MM-DD")
  .refine(esFechaDeCalendario, { message: "La fecha no existe en el calendario" });

/**
 * The date range is mandatory — there is no "all time" report in this phase.
 * `sedeId` is optional at the schema level only; the actions resolve the
 * tenant's default sede when it is absent, so the filter is always applied.
 */
export const reporteFiltrosSchema = z
  .object({
    desde: fechaSchema,
    hasta: fechaSchema,
    sedeId: z.string().optional(),
  })
  .superRefine((filtros, ctx) => {
    const desdeEsValida = fechaSchema.safeParse(filtros.desde).success;
    const hastaEsValida = fechaSchema.safeParse(filtros.hasta).success;

    // Only compare the range once both ends are independently valid dates —
    // otherwise an already-reported per-field error (format or calendar) would
    // be joined by a spurious, contradictory ordering issue.
    if (desdeEsValida && hastaEsValida && filtros.desde > filtros.hasta) {
      ctx.addIssue({
        code: "custom",
        message: "La fecha inicial no puede ser posterior a la final",
        path: ["desde"],
      });
    }
  });

export type ReporteFiltrosInput = z.infer<typeof reporteFiltrosSchema>;
