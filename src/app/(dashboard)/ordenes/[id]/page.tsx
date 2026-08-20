import { notFound } from "next/navigation";
import { getOrden } from "@/app/actions/orden-actions";
import { CambiarEstadoForm } from "./cambiar-estado-form";
import { AgregarItemForm } from "./agregar-item-form";
import { AgregarManoObraForm } from "./agregar-mano-obra-form";

export default async function OrdenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orden = await getOrden(id);

  if (!orden) {
    notFound();
  }

  return (
    <main>
      <h1>
        Orden — {orden.vehiculo.placa} ({orden.cliente.nombre})
      </h1>
      <p>Sede: {orden.sede.nombre}</p>
      <p>Mecánico: {orden.mecanico?.nombre ?? "Sin asignar"}</p>
      <p>Kilometraje de ingreso: {orden.kilometrajeIngreso ?? "—"}</p>
      <p>Síntomas: {orden.sintomas ?? "—"}</p>

      <h2>Estado: {orden.estado}</h2>
      <CambiarEstadoForm ordenId={orden.id} estadoActual={orden.estado} />

      <h2>Ítems (repuestos)</h2>
      <AgregarItemForm ordenId={orden.id} />
      <ul>
        {orden.items.map((item) => (
          <li key={item.id}>
            {item.descripcion} — {item.cantidad} x {item.precioUnitario.toString()}
          </li>
        ))}
      </ul>

      <h2>Mano de obra</h2>
      <AgregarManoObraForm ordenId={orden.id} />
      <ul>
        {orden.manoDeObra.map((linea) => (
          <li key={linea.id}>
            {linea.descripcion} — {linea.horas.toString()}h x {linea.precioHora.toString()}
          </li>
        ))}
      </ul>
    </main>
  );
}
