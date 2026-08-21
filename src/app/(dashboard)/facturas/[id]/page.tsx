import { notFound } from "next/navigation";
import { getFactura } from "@/app/actions/factura-actions";
import { RegistrarPagoForm } from "./registrar-pago-form";
import type { MetodoPago } from "@/generated/prisma-tenant";

const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

export default async function FacturaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const factura = await getFactura(id);

  if (!factura) {
    notFound();
  }

  return (
    <main>
      <h1>
        Factura #{factura.numero} — {factura.cliente.nombre}
      </h1>
      <p>Vehículo: {factura.orden.vehiculo.placa}</p>
      <p>Estado: {factura.estado === "PAGADA" ? "Pagada" : "Pendiente"}</p>

      <h2>Ítems</h2>
      <ul>
        {factura.orden.items.map((item) => (
          <li key={item.id}>
            {item.descripcion} — {item.cantidad} x {item.precioUnitario.toString()}
          </li>
        ))}
      </ul>

      <h2>Mano de obra</h2>
      <ul>
        {factura.orden.manoDeObra.map((linea) => (
          <li key={linea.id}>
            {linea.descripcion} — {linea.horas.toString()}h x {linea.precioHora.toString()}
          </li>
        ))}
      </ul>

      <p>Subtotal: {factura.subtotal.toString()}</p>
      <p>Descuento: {factura.descuento.toString()}</p>
      <p>IVA (19%): {factura.iva.toString()}</p>
      <p>Total: {factura.total.toString()}</p>
      <p>Saldo pendiente: {factura.saldoPendiente.toString()}</p>

      <h2>Pagos</h2>
      {factura.estado === "PENDIENTE" ? <RegistrarPagoForm facturaId={factura.id} /> : null}
      <ul>
        {factura.pagos.map((pago) => (
          <li key={pago.id}>
            {new Date(pago.createdAt).toLocaleDateString()} — {METODO_PAGO_LABELS[pago.metodoPago]} —{" "}
            {pago.monto.toString()}
          </li>
        ))}
      </ul>
    </main>
  );
}
