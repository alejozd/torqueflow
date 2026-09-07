import { z } from "zod";

const roleSchema = z.enum(["ADMIN", "TECNICO", "RECEPCION"]);

/**
 * "Estado" is a select ("Activo"/"Suspendido"), not a checkbox, so unlike
 * ConfiguracionSmtp.activo (on/off HTML checkbox) this is a fixed two-value
 * enum fed by a SelectField and submitted via formData.set, same as `role`.
 */
const activoSchema = z.enum(["true", "false"]).transform((valor) => valor === "true");

interface SedeRuleFields {
  role: "ADMIN" | "TECNICO" | "RECEPCION";
  sedeIds: string[];
  sedeDefectoId?: string;
}

/**
 * Shared by create/update: sedeIds is required (at least one) for every role
 * except ADMIN, who bypasses sede assignment entirely (see
 * resolveSedeActiva's own ADMIN bypass rule -- this form must not force an
 * assignment that the auth layer never checks). sedeDefectoId, when set, must
 * be one of the selected sedeIds for a non-ADMIN; an ADMIN's sedeDefectoId is
 * unrestricted since ADMIN has no assignment restriction to check against.
 */
function withSedeRules<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data, ctx) => {
    const { role, sedeIds, sedeDefectoId } = data as SedeRuleFields;

    if (role !== "ADMIN" && sedeIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecciona al menos una sede",
        path: ["sedeIds"],
      });
    }

    if (sedeDefectoId && role !== "ADMIN" && !sedeIds.includes(sedeDefectoId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La sede por defecto debe ser una de las sedes asignadas",
        path: ["sedeDefectoId"],
      });
    }
  });
}

export const usuarioCreateInputSchema = withSedeRules(
  z.object({
    nombre: z.string().min(1, "El nombre es obligatorio"),
    email: z.string().email("Correo inválido"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    role: roleSchema,
    activo: activoSchema,
    sedeIds: z.array(z.string().min(1)),
    sedeDefectoId: z.string().optional().or(z.literal("")),
  }),
);

export type UsuarioCreateInput = z.infer<typeof usuarioCreateInputSchema>;

/**
 * password: blank means "keep the existing one" -- same convention as
 * ConfiguracionSmtp's password field (Fase 7), applied here for the first
 * time to a tenant Usuario's own credential.
 */
export const usuarioUpdateInputSchema = withSedeRules(
  z.object({
    nombre: z.string().min(1, "El nombre es obligatorio"),
    email: z.string().email("Correo inválido"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional().or(z.literal("")),
    role: roleSchema,
    activo: activoSchema,
    sedeIds: z.array(z.string().min(1)),
    sedeDefectoId: z.string().optional().or(z.literal("")),
  }),
);

export type UsuarioUpdateInput = z.infer<typeof usuarioUpdateInputSchema>;
