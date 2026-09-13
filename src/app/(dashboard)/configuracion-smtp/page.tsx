import { getConfiguracionSmtp, getUltimosEnviosSmtp } from "@/app/actions/smtp-actions";
import { ConfiguracionSmtpForm } from "./configuracion-smtp-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatoFechaRelativa } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";

// Same PENDIENTE/PAGADA-style green-vs-outline badge convention as
// facturas/[id]/page.tsx and cotizaciones/[id]/page.tsx.
const ESTADO_BADGE_CLASSNAME = "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]";

export default async function ConfiguracionSmtpPage() {
  // getConfiguracionSmtp calls requireRole(["ADMIN"]), so a TECNICO/RECEPCION
  // reaching this URL is redirected before anything renders.
  const [configuracion, envios] = await Promise.all([getConfiguracionSmtp(), getUltimosEnviosSmtp()]);
  const ahora = new Date();

  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Configuración SMTP</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          TorqueFlow envía los recordatorios de mantenimiento usando el servidor de correo de tu propio taller. La
          contraseña se guarda cifrada y nunca se muestra de vuelta.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Servidor</CardTitle>
            {configuracion ? (
              <Badge
                variant={configuracion.activo ? "default" : "outline"}
                className={cn("gap-1.5", configuracion.activo && ESTADO_BADGE_CLASSNAME)}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: configuracion.activo ? "oklch(0.4 0.1 150)" : "oklch(0.7 0 0)" }}
                />
                {configuracion.activo ? "Activo" : "Inactivo"}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5">
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                Sin configurar
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <ConfiguracionSmtpForm configuracion={configuracion} />
          </CardContent>
        </Card>

        <div className="sticky top-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Últimos envíos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {envios.length > 0 ? (
                envios.map((envio) => (
                  <div key={envio.id} className="flex items-start gap-2 text-sm">
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        envio.ok ? "bg-[oklch(0.4_0.1_150)]" : "bg-destructive",
                      )}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{envio.titulo}</span>
                      <span className="truncate text-xs text-muted-foreground">{envio.destinatario}</span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatoFechaRelativa(envio.enviadoAt, ahora)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Aún no se ha enviado ningún correo.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
