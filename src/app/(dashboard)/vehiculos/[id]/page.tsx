import { notFound } from "next/navigation";
import Link from "next/link";
import { getVehiculo } from "@/app/actions/vehiculo-actions";
import { listHistorial } from "@/app/actions/historial-actions";
import { listOrdenesByVehiculo, listTecnicos } from "@/app/actions/orden-actions";
import { NuevaEntradaForm } from "./nueva-entrada-form";
import { NuevaOrdenForm } from "./nueva-orden-form";

export default async function VehiculoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehiculo = await getVehiculo(id);

  if (!vehiculo) {
    notFound();
  }

  const [historial, ordenes, tecnicos] = await Promise.all([
    listHistorial(id),
    listOrdenesByVehiculo(id),
    listTecnicos(),
  ]);

  return (
    <main>
      <h1>
        {vehiculo.placa} — {vehiculo.marca} {vehiculo.modelo}
      </h1>
      <p>Año: {vehiculo.anio ?? "—"}</p>

      <h2>Órdenes de trabajo</h2>
      <NuevaOrdenForm clienteId={vehiculo.clienteId} vehiculoId={vehiculo.id} tecnicos={tecnicos} />
      <ul>
        {ordenes.map((orden) => (
          <li key={orden.id}>
            <Link href={`/ordenes/${orden.id}`}>
              {new Date(orden.createdAt).toLocaleDateString()} — {orden.estado}
            </Link>
          </li>
        ))}
      </ul>

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
