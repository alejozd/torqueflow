import { getConfiguracionSmtp } from "@/app/actions/smtp-actions";
import { ConfiguracionSmtpForm } from "./configuracion-smtp-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ConfiguracionSmtpPage() {
  // getConfiguracionSmtp calls requireRole(["ADMIN"]), so a TECNICO/RECEPCION
  // reaching this URL is redirected before anything renders.
  const configuracion = await getConfiguracionSmtp();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Configuración SMTP</h1>

      <Card>
        <CardHeader>
          <CardTitle>Configuración SMTP</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            TorqueFlow envía los recordatorios de mantenimiento usando el servidor de correo de tu propio
            taller. La contraseña se guarda cifrada y nunca se muestra de vuelta.
          </p>
          <ConfiguracionSmtpForm configuracion={configuracion} />
        </CardContent>
      </Card>
    </main>
  );
}
