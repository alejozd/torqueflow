import Link from "next/link";
import { notFound } from "next/navigation";
import { getComprobanteVentaMostrador } from "@/app/actions/venta-mostrador-actions";
import { requirePermiso } from "@/lib/auth/guards";
import {
  AVISO_NO_FACTURA,
  ETIQUETA_METODO_PAGO,
  formatoFechaHoraBogota,
} from "@/lib/mostrador/comprobante";
import { ImprimirButton } from "./imprimir-button";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const pesos = (valor: number) => formatoMoneda.format(valor);

/**
 * Comprobante imprimible de una venta de mostrador (rediseño, tarea 7). Vive
 * fuera del grupo (dashboard), como el acta y la cotización, para imprimirse
 * sin el menú; el acceso lo exige `getComprobanteVentaMostrador` (ADMIN o
 * RECEPCION, sede activa). `?imprimir=1` abre el diálogo de impresión al cargar.
 */
export default async function ComprobanteVentaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  // El loader ya lo exige; se repite aquí para que la página lo diga sola (Fase 26, I3).
  await requirePermiso("mostrador.vender");
  const { id } = await params;
  const consulta = await searchParams;
  const venta = await getComprobanteVentaMostrador(id);

  if (!venta) {
    notFound();
  }

  const mostrarVueltas = venta.recibidoEfectivo !== null && venta.vueltas > 0;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 p-6 text-sm text-black">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/mostrador" className="text-blue-700 underline">
          ← Volver al mostrador
        </Link>
        <ImprimirButton automatico={consulta.imprimir === "1"} />
      </div>

      <header className="flex flex-col gap-0.5 border-b border-black/20 pb-3 text-center">
        <h1 className="text-lg font-semibold">{venta.tallerNombre}</h1>
        <p className="text-black/70">{venta.sedeNombre}</p>
        <p className="mt-2 font-semibold">Comprobante de venta #{venta.numero}</p>
        <p className="text-black/70">{formatoFechaHoraBogota.format(venta.fecha)}</p>
      </header>

      <section>
        <h2 className="font-semibold">Cliente</h2>
        {venta.cliente ? (
          <>
            <p>{venta.cliente.nombre}</p>
            {venta.cliente.documento ? <p className="text-black/70">Documento {venta.cliente.documento}</p> : null}
          </>
        ) : (
          <p>Consumidor final</p>
        )}
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-black/40 text-left">
            <th className="py-1 pr-2">Producto</th>
            <th className="py-1 pr-2 text-right">Cant.</th>
            <th className="py-1 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {venta.lineas.map((linea) => (
            <tr key={linea.id} className="border-b border-black/10 break-inside-avoid">
              <td className="py-1 pr-2">
                {linea.descripcion}
                <span className="block text-xs text-black/60">{pesos(linea.precioUnitario)} c/u</span>
              </td>
              <td className="py-1 pr-2 text-right">{linea.cantidad}</td>
              <td className="py-1 text-right">{pesos(linea.cantidad * linea.precioUnitario)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto flex w-full max-w-xs flex-col gap-1">
        <Fila etiqueta="Subtotal" valor={pesos(venta.subtotal)} />
        {venta.descuento > 0 ? <Fila etiqueta="Descuento" valor={`−${pesos(venta.descuento)}`} /> : null}
        <Fila etiqueta="IVA" valor={pesos(venta.iva)} />
        <Fila etiqueta="Total" valor={pesos(venta.total)} fuerte />
      </dl>

      <dl aria-label="Pagos" className="ml-auto flex w-full max-w-xs flex-col gap-1">
        {venta.pagos.length === 0 ? <Fila etiqueta="Forma de pago" valor="A crédito" /> : null}
        {venta.pagos.map((pago) => (
          <Fila key={pago.metodoPago} etiqueta={ETIQUETA_METODO_PAGO[pago.metodoPago]} valor={pesos(pago.monto)} />
        ))}
        {mostrarVueltas ? (
          <>
            <Fila etiqueta="Recibido en efectivo" valor={pesos(venta.recibidoEfectivo ?? 0)} />
            <Fila etiqueta="Vueltas" valor={pesos(venta.vueltas)} />
          </>
        ) : null}
        {venta.saldoPendiente > 0 ? <Fila etiqueta="Saldo pendiente" valor={pesos(venta.saldoPendiente)} fuerte /> : null}
      </dl>

      <p className="border-t border-black/20 pt-3 text-center text-xs text-black/70">{AVISO_NO_FACTURA}</p>
    </main>
  );
}

function Fila({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={fuerte ? "flex justify-between font-semibold" : "flex justify-between"}>
      <dt className={fuerte ? undefined : "text-black/70"}>{etiqueta}</dt>
      <dd>{valor}</dd>
    </div>
  );
}
