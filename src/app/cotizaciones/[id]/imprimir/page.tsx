import Link from "next/link";
import { notFound } from "next/navigation";
import { getCotizacion } from "@/app/actions/cotizacion-actions";
import type { EstadoCotizacion } from "@/generated/prisma-tenant";
import { formatoFechaCorta } from "@/lib/fecha-bogota";
import { ImprimirButton } from "./imprimir-button";

// Same BORRADOR/ENVIADA/APROBADA/RECHAZADA/VENCIDA convention as
// cotizaciones/[id]/page.tsx -- kept local here too rather than extracted to
// a shared module neither page asked for.
const ESTADO_LABELS: Record<EstadoCotizacion, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  VENCIDA: "Vencida",
};

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default async function ImprimirCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cotizacion = await getCotizacion(id);

  if (!cotizacion) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8 text-black">
      <div className="print:hidden flex items-center justify-between gap-3">
        <Link href={`/cotizaciones/${cotizacion.id}`} className="text-sm text-blue-700 underline">
          ← Volver
        </Link>
        <ImprimirButton />
      </div>

      <header className="flex flex-col gap-1 border-b border-black/20 pb-4">
        <h1 className="text-lg font-semibold">{cotizacion.sede.nombre}</h1>
        <p className="text-sm text-black/70">
          Cotización #{cotizacion.numero} · {formatoFechaCorta.format(cotizacion.createdAt)} ·{" "}
          {ESTADO_LABELS[cotizacion.estado]}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-6 text-sm">
        <div>
          <h2 className="mb-1 font-semibold">Cliente</h2>
          <p>{cotizacion.cliente.nombre}</p>
          <p className="text-black/70">{cotizacion.cliente.telefono ?? "—"}</p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold">Vehículo</h2>
          <p>{cotizacion.vehiculo.placa}</p>
          <p className="text-black/70">
            {cotizacion.vehiculo.marca} {cotizacion.vehiculo.modelo}
            {cotizacion.vehiculo.anio ? ` ${cotizacion.vehiculo.anio}` : ""}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Conceptos</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/40 text-left">
              <th className="py-1.5 pr-2">Concepto</th>
              <th className="py-1.5 pr-2">Tipo</th>
              <th className="py-1.5 pr-2 text-right">Cant.</th>
              <th className="py-1.5 pr-2 text-right">Precio unit.</th>
              <th className="py-1.5 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {cotizacion.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-center text-black/60">
                  Esta cotización no tiene conceptos agregados.
                </td>
              </tr>
            ) : (
              cotizacion.items.map((item) => (
                <tr key={item.id} className="border-b border-black/10">
                  <td className="py-1.5 pr-2">{item.descripcion}</td>
                  <td className="py-1.5 pr-2">{item.tipo === "REPUESTO" ? "Repuesto" : "Mano de obra"}</td>
                  <td className="py-1.5 pr-2 text-right">{item.cantidad.toString()}</td>
                  <td className="py-1.5 pr-2 text-right">{formatoMoneda.format(Number(item.precioUnitario))}</td>
                  <td className="py-1.5 text-right">
                    {formatoMoneda.format(Number(item.cantidad) * Number(item.precioUnitario))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-black/70">Subtotal</span>
          <span>{formatoMoneda.format(Number(cotizacion.subtotal))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black/70">Descuento ({Number(cotizacion.descuentoPct)}%)</span>
          <span>−{formatoMoneda.format(Number(cotizacion.descuento))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black/70">IVA (19%)</span>
          <span>{formatoMoneda.format(Number(cotizacion.iva))}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-black/40 pt-1.5 font-semibold">
          <span>Total</span>
          <span>{formatoMoneda.format(Number(cotizacion.total))}</span>
        </div>
      </section>

      {cotizacion.notas ? (
        <section className="text-sm">
          <h2 className="mb-1 font-semibold">Notas</h2>
          <p className="whitespace-pre-wrap text-black/80">{cotizacion.notas}</p>
        </section>
      ) : null}

      {cotizacion.validaHasta ? (
        <p className="text-sm text-black/70">Válida hasta {formatoFechaCorta.format(cotizacion.validaHasta)}</p>
      ) : null}
    </main>
  );
}
