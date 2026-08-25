"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { seleccionarSedeAction } from "@/app/actions/seleccionar-sede-actions";
import type { SedeActiva } from "@/lib/auth/sede-access";

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
    <form onSubmit={handleSubmit}>
      <label htmlFor="sedeId">Sede</label>
      <select id="sedeId" name="sedeId" required defaultValue={sedes[0]?.id ?? ""}>
        {sedes.map((sede) => (
          <option key={sede.id} value={sede.id}>
            {sede.nombre}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending || sinSedes}>
        {isPending ? "Guardando..." : "Continuar"}
      </button>

      {sinSedes ? (
        <p role="alert">No tienes ninguna sede asignada. Contacta al administrador.</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
