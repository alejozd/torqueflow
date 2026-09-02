"use client";

import { useActionState } from "react";
import {
  cambiarEstadoTenantAction,
  cambiarPlanTenantAction,
  type SuperAdminFormState,
} from "@/app/actions/super-admin-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

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
    <div className="flex flex-col gap-2">
      <form action={estadoFormAction} className="flex flex-col gap-1.5">
        <input type="hidden" name="estado" value={nuevoEstado} />
        <Button type="submit" variant="outline" size="sm" disabled={estadoPending}>
          {estadoActual === "ACTIVO" ? "Suspender" : "Activar"}
        </Button>
        {estadoState.error ? (
          <Alert variant="destructive">
            <AlertDescription>{estadoState.error}</AlertDescription>
          </Alert>
        ) : null}
      </form>

      <form action={planFormAction} className="flex flex-col gap-1.5">
        <Label htmlFor={`plan-${tenantId}`}>Plan</Label>
        {/*
          Native <select>, not shadcn's Select (Base UI, no DOM <option>s
          while closed) -- userEvent.selectOptions() in the existing test
          needs a real <select>/<option> element. Styled by hand to match
          the shadcn select trigger look (see seleccionar-sede-form.tsx).
        */}
        <NativeSelect id={`plan-${tenantId}`} name="planId" defaultValue={planIdActual}>
          {planes.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.nombre}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" size="sm" disabled={planPending}>
          Guardar plan
        </Button>
        {planState.error ? (
          <Alert variant="destructive">
            <AlertDescription>{planState.error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </div>
  );
}
