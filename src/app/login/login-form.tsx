"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginErrorAlert } from "./login-error-alert";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    const result = await signIn("credentials", { email, password, redirect: false, callbackUrl: "/" });
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
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error ? <LoginErrorAlert message={error} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
          Correo
        </Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="email" name="email" type="email" required className="h-10 rounded-[10px] pl-9 text-[13.5px]" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="password"
          className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase"
        >
          Contraseña
        </Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            className="h-10 rounded-[10px] pr-16 pl-9 text-[13.5px]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute top-1/2 right-3 flex -translate-y-1/2 cursor-pointer items-center gap-1 text-[11px] font-semibold text-primary"
          >
            {showPassword ? (
              <>
                <EyeOff className="size-3.5" /> Ocultar
              </>
            ) : (
              <>
                <Eye className="size-3.5" /> Mostrar
              </>
            )}
          </button>
        </div>
      </div>

      <Button type="submit" disabled={isPending} className="h-[42px] w-full rounded-[10px] text-[13.5px]">
        {isPending ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
