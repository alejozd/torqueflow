"use client";

import { useActionState } from "react";
import { createRepuestoAction, type RepuestoFormState } from "@/app/actions/repuesto-actions";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";

const initialState: RepuestoFormState = { error: null, success: false };

export function NuevoRepuestoForm({
  bodegas,
  proveedores,
}: {
  bodegas: Bodega[];
  proveedores: Proveedor[];
}) {
  const [state, formAction, isPending] = useActionState(createRepuestoAction, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="codigo">Código</label>
      <input id="codigo" name="codigo" required />

      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" required />

      <label htmlFor="descripcion">Descripción</label>
      <textarea id="descripcion" name="descripcion" />

      <label htmlFor="precioCompra">Precio de compra</label>
      <input id="precioCompra" name="precioCompra" type="number" min="0" step="0.01" required />

      <label htmlFor="precioVenta">Precio de venta</label>
      <input id="precioVenta" name="precioVenta" type="number" min="0" step="0.01" required />

      <label htmlFor="stockActual">Stock inicial</label>
      <input id="stockActual" name="stockActual" type="number" min="0" defaultValue="0" required />

      <label htmlFor="stockMinimo">Stock mínimo</label>
      <input id="stockMinimo" name="stockMinimo" type="number" min="0" defaultValue="0" required />

      <label htmlFor="bodegaId">Bodega</label>
      <select id="bodegaId" name="bodegaId" defaultValue="" required>
        <option value="" disabled>
          Selecciona una bodega
        </option>
        {bodegas.map((bodega) => (
          <option key={bodega.id} value={bodega.id}>
            {bodega.nombre}
          </option>
        ))}
      </select>

      <label htmlFor="proveedorId">Proveedor</label>
      <select id="proveedorId" name="proveedorId" defaultValue="">
        <option value="">Sin proveedor asignado</option>
        {proveedores.map((proveedor) => (
          <option key={proveedor.id} value={proveedor.id}>
            {proveedor.nombre}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear repuesto"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Repuesto creado</p> : null}
    </form>
  );
}
