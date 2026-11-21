"use client";

import { useActionState } from "react";
import { registrarTokenBolsaAction } from "@/app/actions/super-admin-fe-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TokenBolsaForm({ tenantId, tokenRegistrado }: { tenantId: string; tokenRegistrado: boolean }) {
  const [state, formAction, isPending] = useActionState(registrarTokenBolsaAction.bind(null, tenantId), {
    error: null,
    success: false,
  });
  const campoId = `token-bolsa-${tenantId}`;

  return (
    <form action={formAction} className="flex min-w-64 flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        {tokenRegistrado
          ? "Ya hay un token registrado; escribe uno nuevo para cambiarlo."
          : "Sin token: este taller solo puede usar Simulado."}
      </p>
      <Label htmlFor={campoId}>Token de la bolsa</Label>
      <div className="flex gap-2">
        <Input id={campoId} name="token" type="password" autoComplete="off" />
        <Button type="submit" size="sm" disabled={isPending}>
          Guardar token
        </Button>
      </div>
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-xs text-green-700">Token guardado.</p> : null}
    </form>
  );
}
