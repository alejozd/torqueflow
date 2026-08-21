import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrden } from "@/app/actions/orden-actions";
import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { CambiarEstadoForm } from "./cambiar-estado-form";
import { AgregarItemForm } from "./agregar-item-form";
import { AgregarManoObraForm } from "./agregar-mano-obra-form";
import { DviChecklistForm } from "./dvi-checklist-form";
import { DviFotoForm } from "./dvi-foto-form";
import { GenerarFacturaForm } from "./generar-factura-form";
import type { DviChecklist } from "@/lib/dvi/checklist-items";

export default async function OrdenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [orden, repuestos] = await Promise.all([getOrden(id), listRepuestoOptions()]);

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
      <AgregarItemForm ordenId={orden.id} repuestos={repuestos} />
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

      <h2>Inspección vehicular digital (DVI)</h2>
      <DviChecklistForm ordenId={orden.id} checklist={(orden.dvi?.checklist as DviChecklist | undefined) ?? null} />
      <DviFotoForm ordenId={orden.id} />
      <ul>
        {orden.dvi?.fotos.map((foto) => (
          <li key={foto.id}>
            {foto.momento === "ANTES" ? "Antes" : "Después"}:{" "}
            {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated route, next/image's optimizer can't reach it */}
            <img src={foto.url} alt={`Foto ${foto.momento.toLowerCase()} de la inspección`} width={200} />
          </li>
        ))}
      </ul>

      <h2>Facturación</h2>
      {orden.factura ? (
        <p>
          <Link href={`/facturas/${orden.factura.id}`}>Ver factura #{orden.factura.numero}</Link>
        </p>
      ) : orden.estado === "TERMINADA" || orden.estado === "ENTREGADA" ? (
        <GenerarFacturaForm ordenId={orden.id} />
      ) : (
        <p>La orden debe estar Terminada o Entregada para poder facturarse.</p>
      )}
    </main>
  );
}
