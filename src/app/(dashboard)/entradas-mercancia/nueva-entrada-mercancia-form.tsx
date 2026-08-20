"use client";

import { useActionState } from "react";
import { createEntradaMercanciaAction, type EntradaFormState } from "@/app/actions/entrada-mercancia-actions";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";

const initialState: EntradaFormState = { error: null, success: false };

export function NuevaEntradaMercanciaForm({
  proveedores,
  bodegas,
}: {
  proveedores: Proveedor[];
  bodegas: Bodega[];
}) {
  const [state, formAction, isPending] = useActionState(createEntradaMercanciaAction, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="proveedorId">Proveedor</label>
      <select id="proveedorId" name="proveedorId" defaultValue="" required>
        <option value="" disabled>
          Selecciona un proveedor
        </option>
        {proveedores.map((proveedor) => (
          <option key={proveedor.id} value={proveedor.id}>
            {proveedor.nombre}
          </option>
        ))}
      </select>

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

      <button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear entrada"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Entrada creada</p> : null}
    </form>
  );
}
