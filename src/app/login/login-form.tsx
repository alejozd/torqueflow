"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

    // callbackUrl is pinned to a clean, fixed value -- next-auth's implicit
    // default (window.location.href) would echo back through the response
    // whatever query string happens to be on the current page, and any
    // leftover "?error=..." from a previous redirect gets misread by
    // next-auth/react's signIn() as a fresh failure.
    const result = await signIn("credentials", { email, password, redirect: false, callbackUrl: "/clientes" });
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" required />
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Ingresando..." : "Ingresar"}
      </Button>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
