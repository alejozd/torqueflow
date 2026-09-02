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
import { SelectField } from "@/components/ui/select-field";

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
        <SelectField
          id={`plan-${tenantId}`}
          name="planId"
          defaultValue={planIdActual}
          items={planes.map((plan) => ({ value: plan.id, label: plan.nombre }))}
        />
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
