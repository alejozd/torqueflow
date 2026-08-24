import { getConfiguracionSmtp } from "@/app/actions/smtp-actions";
import { ConfiguracionSmtpForm } from "./configuracion-smtp-form";

export default async function ConfiguracionSmtpPage() {
  // getConfiguracionSmtp calls requireRole(["ADMIN"]), so a TECNICO/RECEPCION
  // reaching this URL is redirected before anything renders.
  const configuracion = await getConfiguracionSmtp();

  return (
    <main>
      <h1>Configuración SMTP</h1>
      <p>
        TorqueFlow envía los recordatorios de mantenimiento usando el servidor de correo de tu propio
        taller. La contraseña se guarda cifrada y nunca se muestra de vuelta.
      </p>
      <ConfiguracionSmtpForm configuracion={configuracion} />
    </main>
  );
}
