"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { seleccionarSedeAction } from "@/app/actions/seleccionar-sede-actions";
import type { SedeActiva } from "@/lib/auth/sede-access";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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

    // /clientes was already visited once this navigation cycle --
    // requireSession() redirected here because sedeActivaId was still empty
    // at that point. router.refresh() forces Next.js to re-fetch it instead
    // of serving that earlier redirect from the client Router Cache, now
    // that the session cookie carries the chosen sede.
    router.push("/clientes");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sedeId">Sede</Label>
        {/*
          Native <select>, not shadcn's Select (Base UI, no DOM <option>s
          while closed) -- userEvent.selectOptions()/getByRole("option")
          in the existing tests need real <select>/<option> elements.
          Styled by hand to match the shadcn select trigger look.
        */}
        <select
          id="sedeId"
          name="sedeId"
          required
          defaultValue={sedes[0]?.id ?? ""}
          className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
        >
          {sedes.map((sede) => (
            <option key={sede.id} value={sede.id}>
              {sede.nombre}
            </option>
          ))}
        </select>
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
