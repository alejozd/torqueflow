"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { SedeOption } from "@/lib/sede/login-sedes";

export function LoginForm({ sedes }: { sedes: SedeOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const sinSedes = sedes.length === 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const sedeId = String(formData.get("sedeId") ?? "");

    const result = await signIn("credentials", { email, password, sedeId, redirect: false });
    setIsPending(false);

    // NextAuth's credentials callback responds HTTP 200 even when the
    // credentials are wrong (it redirects to an error page instead of
    // returning a 4xx) -- `result.ok` reflects only the HTTP status, not
    // whether authentication actually succeeded. `error` is the field that
    // distinguishes a real failure.
    if (result?.error) {
      // One message for every failure -- wrong password, unknown email, and
      // "not assigned to that sede" are indistinguishable on purpose, so this
      // form cannot be used to enumerate accounts or sede assignments.
      setError("Correo, contraseña o sede incorrectos");
      return;
    }

    router.push("/clientes");
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Correo</label>
      <input id="email" name="email" type="email" required />

      <label htmlFor="password">Contraseña</label>
      <input id="password" name="password" type="password" required />

      <label htmlFor="sedeId">Sede</label>
      <select id="sedeId" name="sedeId" required defaultValue={sedes[0]?.id ?? ""}>
        {sedes.map((sede) => (
          <option key={sede.id} value={sede.id}>
            {sede.nombre}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending || sinSedes}>
        {isPending ? "Ingresando..." : "Ingresar"}
      </button>

      {sinSedes ? (
        <p role="alert">Este taller no tiene sedes configuradas. Contacta al administrador.</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
