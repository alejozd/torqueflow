import { z } from "zod";

export const bodegaInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
});

export type BodegaInput = z.infer<typeof bodegaInputSchema>;

export const proveedorInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  contacto: z.string().optional().or(z.literal("")),
  telefono: z.string().optional().or(z.literal("")),
  email: z.string().email("Correo inválido").optional().or(z.literal("")),
});

export type ProveedorInput = z.infer<typeof proveedorInputSchema>;
