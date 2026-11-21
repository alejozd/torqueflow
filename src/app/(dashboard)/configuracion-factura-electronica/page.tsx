import { requirePermiso } from "@/lib/auth/guards";
import { getConfiguracionFe } from "@/app/actions/factura-electronica-config-actions";
import { MUNICIPIOS } from "@/modulos/factura-electronica";
import { avisosResolucion } from "@/lib/factura-electronica/avisos-resolucion";
import { fechaHoraBogota } from "@/lib/factura-electronica/hora-bogota";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EncabezadoConfiguracion } from "../pestanas-configuracion";
import { ConfiguracionFeForm } from "./configuracion-fe-form";

export default async function ConfiguracionFacturaElectronicaPage() {
  // Quien no tenga el permiso es redirigido a /sin-permiso antes de renderizar.
  const session = await requirePermiso("facturaElectronica.configurar");
  const configuracion = await getConfiguracionFe();
  const avisos = avisosResolucion(configuracion, fechaHoraBogota(new Date()).fecha);

  return (
    <main className="flex flex-col gap-4">
      <div>
        <EncabezadoConfiguracion actual="/configuracion-factura-electronica" permisos={session.user.permisos} />
        <p className="mt-3 text-sm text-muted-foreground">
          Con la facturación electrónica activa, cada factura del taller se envía a la DIAN. Empieza en Simulado para
          practicar; cuando tengas la resolución y el token del proveedor, pasa a Pruebas y luego a Producción.
        </p>
      </div>
      {avisos.map((aviso) => (
        <Alert key={aviso} variant="destructive">
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      ))}
      <ConfiguracionFeForm configuracion={configuracion} municipios={MUNICIPIOS} />
    </main>
  );
}
