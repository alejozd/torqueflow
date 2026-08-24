import { notFound } from "next/navigation";
import { getCita } from "@/app/actions/cita-actions";
import { CambiarEstadoCitaForm } from "./cambiar-estado-cita-form";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeStyle: "short" });

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
    <main>
      <h1>{`Cita ${cita.vehiculo.placa}`}</h1>
      <p>{`Fecha: ${formatoFecha.format(cita.fechaHora)}`}</p>
      <p>{`Cliente: ${cita.cliente.nombre}`}</p>
      <p>{`Vehículo: ${cita.vehiculo.marca} ${cita.vehiculo.modelo} (${cita.vehiculo.placa})`}</p>
      <p>{`Motivo: ${cita.motivo}`}</p>
      {cita.notas ? <p>{`Notas: ${cita.notas}`}</p> : null}
      <p>{`Agendada por: ${cita.creadoPor.nombre}`}</p>
      <p>{`Estado actual: ${cita.estado}`}</p>

      <CambiarEstadoCitaForm citaId={cita.id} estadoActual={cita.estado} />
    </main>
  );
}
