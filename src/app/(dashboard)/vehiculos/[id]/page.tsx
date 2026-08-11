import { notFound } from "next/navigation";
import { getVehiculo } from "@/app/actions/vehiculo-actions";
import { listHistorial } from "@/app/actions/historial-actions";
import { NuevaEntradaForm } from "./nueva-entrada-form";

export default async function VehiculoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehiculo = await getVehiculo(id);

  if (!vehiculo) {
    notFound();
  }

  const historial = await listHistorial(id);

  return (
    <main>
      <h1>
        {vehiculo.placa} — {vehiculo.marca} {vehiculo.modelo}
      </h1>
      <p>Año: {vehiculo.anio ?? "—"}</p>

      <h2>Historial</h2>
      <NuevaEntradaForm vehiculoId={vehiculo.id} />
      <ul>
        {historial.map((entrada) => (
          <li key={entrada.id}>
            {new Date(entrada.fecha).toLocaleDateString()} — {entrada.descripcion} —{" "}
            {entrada.autor?.nombre ?? "Desconocido"}
          </li>
        ))}
      </ul>
    </main>
  );
}
