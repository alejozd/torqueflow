"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function SuperAdminLoginForm() {
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

    if (!result?.ok) {
      setError("Correo o contraseña incorrectos");
      return;
    }

    router.push("/superadmin");
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
