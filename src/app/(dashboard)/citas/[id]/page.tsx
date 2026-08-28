import { notFound } from "next/navigation";
import { getCita, listVehiculosParaCita } from "@/app/actions/cita-actions";
import { CambiarEstadoCitaForm } from "./cambiar-estado-cita-form";
import { EditarCitaForm } from "./editar-cita-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CitaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // getCita is a sede-scoped findFirst, so a cita from another sede arrives here
  // as null and this 404s. That is the whole IDOR boundary for this route:
  // pasting another sede's cita URL must not resolve.
  const [cita, vehiculos] = await Promise.all([getCita(id), listVehiculosParaCita()]);
  if (!cita) {
    notFound();
  }

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{`Cita ${cita.vehiculo.placa}`}</h1>
        <p className="text-sm text-muted-foreground">
          {cita.cliente.nombre} · agendada por {cita.creadoPor.nombre}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editar cita</CardTitle>
        </CardHeader>
        <CardContent>
          <EditarCitaForm cita={cita} vehiculos={vehiculos} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{`Estado actual: ${cita.estado}`}</CardTitle>
        </CardHeader>
        <CardContent>
          <CambiarEstadoCitaForm citaId={cita.id} estadoActual={cita.estado} />
        </CardContent>
      </Card>
    </main>
  );
}
