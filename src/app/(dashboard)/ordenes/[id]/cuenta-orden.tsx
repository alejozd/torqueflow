import type { ReactNode } from "react";
import Link from "next/link";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { GenerarFacturaForm, type LineaFactura } from "./generar-factura-form";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function Fila({ etiqueta, valor }: { etiqueta: ReactNode; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0 text-muted-foreground">{etiqueta}</span>
      <span className="shrink-0 font-mono whitespace-nowrap">{valor}</span>
    </div>
  );
}

/**
 * Lo que cuesta la orden y lo que falta por cobrar (Totales + Facturación en una
 * sola tarjeta): el saldo es el número que pregunta la recepción. Los precios
 * llevan el IVA incluido, así que el total no lo suma ni lo separa (eso pasa en
 * la factura); con la orden ya facturada, los valores son los de la factura.
 */
export function CuentaOrden({
  ordenId,
  estado,
  repuestos,
  manoDeObra,
  descuento = 0,
  etiquetaDescuento = "Descuento",
  origenDescuento,
  total,
  anticipos,
  factura,
  lineas,
}: {
  ordenId: string;
  estado: EstadoOrden;
  repuestos: number;
  manoDeObra: number;
  descuento?: number;
  /** Sin factura, de dónde viene el descuento (la cotización); también prellena la factura. */
  etiquetaDescuento?: string;
  /** De dónde viene ese descuento ("la cotización #46"), para la ayuda del campo en la factura. */
  origenDescuento?: string;
  /** Total con el IVA incluido, ya con el descuento. */
  total: number;
  anticipos: number;
  factura: { id: string; numero: number } | null;
  /** Líneas para revisar su tarifa de IVA al facturar. */
  lineas?: LineaFactura[];
}) {
  const saldo = total - anticipos;

  return (
    <div className="flex flex-col">
      <Fila etiqueta="Repuestos" valor={formatoMoneda.format(repuestos)} />
      <Fila etiqueta="Mano de obra" valor={formatoMoneda.format(manoDeObra)} />
      {descuento > 0 ? <Fila etiqueta={etiquetaDescuento} valor={`− ${formatoMoneda.format(descuento)}`} /> : null}
      <div className="mt-1 flex items-center justify-between border-t border-dashed border-border pt-2 text-sm">
        <span>Total (IVA incluido)</span>
        <span className="font-mono">{formatoMoneda.format(total)}</span>
      </div>
      <Fila etiqueta="Anticipos" valor={`− ${formatoMoneda.format(anticipos)}`} />
      <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2.5">
        <span className="text-sm font-semibold">{saldo < 0 ? "Saldo a favor del cliente" : "Saldo por cobrar"}</span>
        <span className="font-mono text-xl font-semibold">{formatoMoneda.format(Math.abs(saldo))}</span>
      </div>
      <div className={factura || !(estado === "TERMINADA" || estado === "ENTREGADA") ? "mt-3" : "mt-4 border-t border-border pt-4"}>
        {factura ? (
          <Link href={`/facturas/${factura.id}`} className="text-sm underline underline-offset-4">
            Ver factura #{factura.numero}
          </Link>
        ) : estado === "TERMINADA" || estado === "ENTREGADA" ? (
          <GenerarFacturaForm ordenId={ordenId} lineas={lineas} descuentoInicial={descuento} origenDescuento={origenDescuento} />
        ) : estado === "ANULADA" ? null : (
          <p className="text-xs text-muted-foreground">Factura: al terminar</p>
        )}
      </div>
    </div>
  );
}
