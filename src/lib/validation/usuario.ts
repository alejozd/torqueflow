import { z } from "zod";

const roleSchema = z.enum(["ADMIN", "TECNICO", "RECEPCION"]);

export const usuarioCreateInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: roleSchema,
});

export type UsuarioCreateInput = z.infer<typeof usuarioCreateInputSchema>;

/**
 * password: blank means "keep the existing one" -- same convention as
 * ConfiguracionSmtp's password field (Fase 7), applied here for the first
 * time to a tenant Usuario's own credential.
 */
export const usuarioUpdateInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional().or(z.literal("")),
  role: roleSchema,
});

export type UsuarioUpdateInput = z.infer<typeof usuarioUpdateInputSchema>;
