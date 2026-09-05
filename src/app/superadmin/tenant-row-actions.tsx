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

/** "Suspender"/"Activar" for the Acciones column -- one control, aligned with the row. */
export function EstadoTenantButton({
  tenantId,
  estadoActual,
}: {
  tenantId: string;
  estadoActual: "ACTIVO" | "SUSPENDIDO";
}) {
  const cambiarEstadoDeEsteTenant = cambiarEstadoTenantAction.bind(null, tenantId);
  const [estadoState, estadoFormAction, estadoPending] = useActionState(cambiarEstadoDeEsteTenant, initialState);

  const nuevoEstado = estadoActual === "ACTIVO" ? "SUSPENDIDO" : "ACTIVO";

  return (
    <form action={estadoFormAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="estado" value={nuevoEstado} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={estadoPending}
        className={estadoActual === "ACTIVO" ? "text-red-600 hover:bg-red-50" : undefined}
      >
        {estadoActual === "ACTIVO" ? "Suspender" : "Activar"}
      </Button>
      {estadoState.error ? (
        <Alert variant="destructive">
          <AlertDescription>{estadoState.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

/** Inline plan edit for the "Plan asignado" column -- select + save, compact. */
export function PlanTenantSelector({
  tenantId,
  planIdActual,
  planes,
}: {
  tenantId: string;
  planIdActual: string;
  planes: { id: string; nombre: string }[];
}) {
  const cambiarPlanDeEsteTenant = cambiarPlanTenantAction.bind(null, tenantId);
  const [planState, planFormAction, planPending] = useActionState(cambiarPlanDeEsteTenant, initialState);

  return (
    <form action={planFormAction} className="flex flex-col gap-1.5">
      <Label htmlFor={`plan-${tenantId}`} className="sr-only">
        Plan
      </Label>
      <div className="flex items-center gap-1.5">
        <SelectField
          id={`plan-${tenantId}`}
          name="planId"
          defaultValue={planIdActual}
          items={planes.map((plan) => ({ value: plan.id, label: plan.nombre }))}
          size="sm"
        />
        <Button type="submit" variant="outline" size="sm" disabled={planPending}>
          Guardar
        </Button>
      </div>
      {planState.error ? (
        <Alert variant="destructive">
          <AlertDescription>{planState.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
