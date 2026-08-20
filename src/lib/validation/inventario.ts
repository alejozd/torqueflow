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

export const repuestoInputSchema = z.object({
  codigo: z.string().min(1, "El código es obligatorio"),
  nombre: z.string().min(1, "El nombre es obligatorio"),
  descripcion: z.string().optional().or(z.literal("")),
  precioCompra: z.coerce.number().min(0, "El precio de compra no puede ser negativo"),
  precioVenta: z.coerce.number().min(0, "El precio de venta no puede ser negativo"),
  stockMinimo: z.coerce.number().int().min(0, "El stock mínimo no puede ser negativo"),
  bodegaId: z.string().min(1, "Selecciona una bodega"),
  proveedorId: z.string().optional().or(z.literal("")),
});

export type RepuestoInput = z.infer<typeof repuestoInputSchema>;
