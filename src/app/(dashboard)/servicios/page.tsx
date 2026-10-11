import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { listServicios } from "@/app/actions/servicio-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/guards";
import { ServiciosSection } from "./servicios-section";

export default async function ServiciosPage() {
  await requireRole(["ADMIN"]);
  // Secuencial, no Promise.all: cada action pasa por requireRole, que hace redirect() lanzando.
  const servicios = await listServicios();
  const repuestos = await listRepuestoOptions();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Servicios</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo de servicios con su precio base de mano de obra. Un servicio con repuestos es un kit: al aplicarlo en
          una orden o en una cotización se agregan la mano de obra y los repuestos de una sola vez.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo de servicios</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiciosSection servicios={servicios} repuestos={repuestos} />
        </CardContent>
      </Card>
    </div>
  );
}
