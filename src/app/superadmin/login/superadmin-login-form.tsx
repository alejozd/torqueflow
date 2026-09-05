"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SuperAdminLoginForm() {
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

    const result = await signIn("credentials", { email, password, redirect: false });
    setIsPending(false);

    // NextAuth's credentials callback responds HTTP 200 even when the
    // credentials are wrong (it redirects to an error page instead of
    // returning a 4xx) -- `result.ok` reflects only the HTTP status, not
    // whether authentication actually succeeded. `error` is the field that
    // distinguishes a real failure.
    if (result?.error) {
      setError("Correo o contraseña incorrectos");
      return;
    }

    router.push("/superadmin");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
          Correo institucional
        </Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="email" name="email" type="email" required className="pl-9" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="password"
          className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase"
        >
          Contraseña maestra
        </Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            className="pr-16 pl-9"
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

      <Button type="submit" disabled={isPending} className="w-full bg-amber-600 text-white hover:bg-amber-700">
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Ingresando...
          </>
        ) : (
          <>
            Ingresar
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
