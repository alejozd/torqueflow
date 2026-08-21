import { z } from "zod";
import { requiredMoney } from "./money";

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
  precioCompra: requiredMoney("El precio de compra es obligatorio"),
  precioVenta: requiredMoney("El precio de venta es obligatorio"),
  stockMinimo: z.coerce.number().int().min(0, "El stock mínimo no puede ser negativo"),
  bodegaId: z.string().min(1, "Selecciona una bodega"),
  proveedorId: z.string().optional().or(z.literal("")),
});

export type RepuestoInput = z.infer<typeof repuestoInputSchema>;

export const entradaMercanciaInputSchema = z.object({
  proveedorId: z.string().min(1, "Selecciona un proveedor"),
  bodegaId: z.string().min(1, "Selecciona una bodega"),
});

export type EntradaMercanciaInput = z.infer<typeof entradaMercanciaInputSchema>;

export const entradaMercanciaItemInputSchema = z.object({
  repuestoId: z.string().min(1, "Selecciona un repuesto"),
  cantidad: z.coerce.number().int().min(1, "La cantidad debe ser al menos 1"),
  precioCompraUnitario: requiredMoney("El precio de compra unitario es obligatorio"),
});

export type EntradaMercanciaItemInput = z.infer<typeof entradaMercanciaItemInputSchema>;
