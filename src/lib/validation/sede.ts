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
