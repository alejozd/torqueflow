"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await signIn("credentials", { email, password, redirect: false });
    setIsPending(false);

    // NextAuth's credentials callback responds HTTP 200 even when the
    // credentials are wrong (it redirects to an error page instead of
    // returning a 4xx) -- `result.ok` reflects only the HTTP status, not
    // whether authentication actually succeeded. `error` is the field that
    // distinguishes a real failure.
    if (result?.error) {
      // One message for every failure -- wrong password, unknown email, and
      // a suspended tenant are indistinguishable on purpose, so this form
      // cannot be used to enumerate accounts.
      setError("Correo o contraseña incorrectos");
      return;
    }

    // requireSession() picks up from here: it redirects to /seleccionar-sede
    // on its own if this session's sede couldn't be auto-resolved at login.
    router.push("/clientes");
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Correo</label>
      <input id="email" name="email" type="email" required />

      <label htmlFor="password">Contraseña</label>
      <input id="password" name="password" type="password" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Ingresando..." : "Ingresar"}
      </button>

      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
