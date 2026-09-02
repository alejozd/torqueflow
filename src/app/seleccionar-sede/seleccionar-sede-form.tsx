"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { seleccionarSedeAction } from "@/app/actions/seleccionar-sede-actions";
import type { SedeActiva } from "@/lib/auth/sede-access";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

export function SeleccionarSedeForm({ sedes }: { sedes: SedeActiva[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const sinSedes = sedes.length === 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const sedeId = String(formData.get("sedeId") ?? "");

    const result = await seleccionarSedeAction(sedeId);
    setIsPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    // "/" was already visited once this navigation cycle --
    // requireSession() redirected here because sedeActivaId was still empty
    // at that point. router.refresh() forces Next.js to re-fetch it instead
    // of serving that earlier redirect from the client Router Cache, now
    // that the session cookie carries the chosen sede.
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sedeId">Sede</Label>
        {/*
          Uncontrolled SelectField (name + defaultValue, no value/
          onValueChange) -- this form has no react-hook-form, it reads
          FormData straight off the submitted <form> element, so it relies
          on Base UI Select's hidden <input name="sedeId"> to participate
          in that FormData the same way a native <select name="sedeId">
          used to.
        */}
        <SelectField
          id="sedeId"
          name="sedeId"
          required
          defaultValue={sedes[0]?.id ?? ""}
          items={sedes.map((sede) => ({ value: sede.id, label: sede.nombre }))}
        />
      </div>

      <Button type="submit" disabled={isPending || sinSedes} className="w-full">
        {isPending ? "Guardando..." : "Continuar"}
      </Button>

      {sinSedes ? (
        <Alert variant="destructive">
          <AlertDescription>No tienes ninguna sede asignada. Contacta al administrador.</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
