import { SuperAdminLoginForm } from "./superadmin-login-form";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export default function SuperAdminLoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="font-heading text-xl leading-snug font-medium">Panel de super-admin</h1>
          <CardDescription>Acceso restringido a la administración de TorqueFlow</CardDescription>
        </CardHeader>
        <CardContent>
          <SuperAdminLoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
