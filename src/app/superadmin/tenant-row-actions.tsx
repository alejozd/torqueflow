"use client";

import { useActionState } from "react";
import {
  cambiarEstadoTenantAction,
  cambiarPlanTenantAction,
  type SuperAdminFormState,
} from "@/app/actions/super-admin-actions";

const initialState: SuperAdminFormState = { error: null, success: false };

export function TenantRowActions({
  tenantId,
  estadoActual,
  planIdActual,
  planes,
}: {
  tenantId: string;
  estadoActual: "ACTIVO" | "SUSPENDIDO";
  planIdActual: string;
  planes: { id: string; nombre: string }[];
}) {
  const cambiarEstadoDeEsteTenant = cambiarEstadoTenantAction.bind(null, tenantId);
  const cambiarPlanDeEsteTenant = cambiarPlanTenantAction.bind(null, tenantId);
  const [estadoState, estadoFormAction, estadoPending] = useActionState(cambiarEstadoDeEsteTenant, initialState);
  const [planState, planFormAction, planPending] = useActionState(cambiarPlanDeEsteTenant, initialState);

  const nuevoEstado = estadoActual === "ACTIVO" ? "SUSPENDIDO" : "ACTIVO";

  return (
    <>
      <form action={estadoFormAction}>
        <input type="hidden" name="estado" value={nuevoEstado} />
        <button type="submit" disabled={estadoPending}>
          {estadoActual === "ACTIVO" ? "Suspender" : "Activar"}
        </button>
        {estadoState.error ? <p role="alert">{estadoState.error}</p> : null}
      </form>

      <form action={planFormAction}>
        <label htmlFor={`plan-${tenantId}`}>Plan</label>
        <select id={`plan-${tenantId}`} name="planId" defaultValue={planIdActual}>
          {planes.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.nombre}
            </option>
          ))}
        </select>
        <button type="submit" disabled={planPending}>
          Guardar plan
        </button>
        {planState.error ? <p role="alert">{planState.error}</p> : null}
      </form>
    </>
  );
}
