import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { SuperAdminLoginForm } from "./superadmin-login-form";
import { Card, CardContent } from "@/components/ui/card";

export default function SuperAdminLoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted/30 p-4">
      <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
        <ShieldCheck className="size-3.5" />
        Entorno protegido · Acceso restringido
      </span>

      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 pt-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-amber-100">
            <ShieldCheck className="size-6 text-amber-600" />
          </span>

          <div>
            <h1 className="font-heading text-xl leading-snug font-bold">Panel de Super-Admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Acceso restringido a la administración de TorqueFlow
            </p>
          </div>

          <div className="w-full text-left">
            <SuperAdminLoginForm />
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        ¿No tenés permisos de Super-Admin?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Ir al portal de taller
        </Link>
      </p>

      <footer className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">TorqueFlow Multi-Tenant Cloud</span>
        <span>•</span>
        <span>Consola Superadmin</span>
      </footer>
    </main>
  );
}
