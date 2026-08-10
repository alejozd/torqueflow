import { z } from "zod";

export const clienteInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  telefono: z.string().optional().or(z.literal("")),
  email: z.string().email("Correo inválido").optional().or(z.literal("")),
  documento: z.string().optional().or(z.literal("")),
});

export type ClienteInput = z.infer<typeof clienteInputSchema>;
