import { notFound } from "next/navigation";
import { getCita } from "@/app/actions/cita-actions";
import { CambiarEstadoCitaForm } from "./cambiar-estado-cita-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export default async function CitaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cita = await getCita(id);

  // getCita is a sede-scoped findFirst, so a cita from another sede arrives here
  // as null and this 404s. That is the whole IDOR boundary for this route:
  // pasting another sede's cita URL must not resolve.
  if (!cita) {
    notFound();
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{`Cita ${cita.vehiculo.placa}`}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Información de la cita</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Fecha</p>
              <p className="text-sm">{formatoFecha.format(cita.fechaHora)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cliente</p>
              <p className="text-sm">{cita.cliente.nombre}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vehículo</p>
              <p className="font-mono text-sm">{`${cita.vehiculo.marca} ${cita.vehiculo.modelo} (${cita.vehiculo.placa})`}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Motivo</p>
              <p className="text-sm">{cita.motivo}</p>
            </div>
            {cita.notas ? (
              <div>
                <p className="text-xs text-muted-foreground">Notas</p>
                <p className="text-sm">{cita.notas}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs text-muted-foreground">Agendada por</p>
              <p className="text-sm">{cita.creadoPor.nombre}</p>
            </div>
          </div>
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
