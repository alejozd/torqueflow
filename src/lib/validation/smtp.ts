import { z } from "zod";

/**
 * The per-tenant SMTP server form.
 *
 * `password` is optional and tolerates "": the form never renders the stored
 * password back to the browser, so an ADMIN editing the host or port submits an
 * empty password field. The action reads "" as "keep whatever is stored" and
 * only refuses it when there is no stored row yet.
 *
 * `activo` is an HTML checkbox: present ("on") when checked, absent/"" when not.
 * z.literal("on") would reject the unchecked case, so it is parsed as a plain
 * string and mapped to a boolean.
 */
export const smtpConfigInputSchema = z.object({
  host: z.string().min(1, "El servidor SMTP es obligatorio"),
  puerto: z.coerce
    .number({ message: "El puerto debe ser un número" })
    .int("El puerto debe ser un número entero")
    .min(1, "El puerto debe estar entre 1 y 65535")
    .max(65535, "El puerto debe estar entre 1 y 65535"),
  usuario: z.string().min(1, "El usuario SMTP es obligatorio"),
  password: z.string().optional().or(z.literal("")),
  fromEmail: z.string().min(1, "El correo remitente es obligatorio").email("El correo remitente no es válido"),
  fromNombre: z.string().min(1, "El nombre del remitente es obligatorio"),
  activo: z.string().optional().transform((valor) => valor === "on" || valor === "true"),
});

export type SmtpConfigInput = z.infer<typeof smtpConfigInputSchema>;
