import { z } from "zod";

/**
 * Same shape as proveedorInputSchema: a required nombre plus optional strings
 * that tolerate "" (Sede.direccion is String? in the tenant schema, and an
 * untouched <input> submits "" rather than being absent).
 */
export const sedeInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  direccion: z.string().optional().or(z.literal("")),
});

export type SedeInput = z.infer<typeof sedeInputSchema>;

/**
 * The checkbox set on /usuarios. At least one sede is mandatory: a
 * TECNICO/RECEPCION with zero assignments cannot pass the login sede gate at
 * all, so saving an empty selection would silently lock the user out.
 */
export const usuarioSedesInputSchema = z.object({
  sedeIds: z.array(z.string().min(1)).min(1, "Selecciona al menos una sede"),
});

export type UsuarioSedesInput = z.infer<typeof usuarioSedesInputSchema>;
