import type { ReactNode } from "react";
import Link from "next/link";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { etiquetaTramoIva, type TramoIva } from "@/lib/iva/desglose";
import { GenerarFacturaForm } from "./generar-factura-form";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function Fila({ etiqueta, valor }: { etiqueta: ReactNode; valor: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="font-mono">{valor}</span>
    </div>
  );
}

/**
 * Lo que cuesta la orden y lo que falta por cobrar (Totales + Facturación en una
 * sola tarjeta): el saldo es el número que pregunta la recepción. El total
 * incluye el IVA de cada tarifa; con la orden ya facturada, los valores son los
 * que quedaron en la factura (con su descuento).
 */
export function CuentaOrden({
  ordenId,
  estado,
  repuestos,
  manoDeObra,
  descuento = 0,
  desgloseIva,
  total,
  anticipos,
  factura,
}: {
  ordenId: string;
  estado: EstadoOrden;
  repuestos: number;
  manoDeObra: number;
  descuento?: number;
  desgloseIva: TramoIva[];
  /** Total con IVA. */
  total: number;
  anticipos: number;
  factura: { id: string; numero: number } | null;
}) {
  const saldo = total - anticipos;

  return (
    <div className="flex flex-col">
      <Fila etiqueta="Repuestos" valor={formatoMoneda.format(repuestos)} />
      <Fila etiqueta="Mano de obra" valor={formatoMoneda.format(manoDeObra)} />
      {descuento > 0 ? <Fila etiqueta="Descuento" valor={`− ${formatoMoneda.format(descuento)}`} /> : null}
      {desgloseIva.map((tramo) => (
        <Fila
          key={tramo.ivaPct}
          etiqueta={
            <>
              {etiquetaTramoIva(tramo)}
              <span className="block text-xs text-muted-foreground/80">sobre {formatoMoneda.format(tramo.base)}</span>
            </>
          }
          valor={formatoMoneda.format(tramo.iva)}
        />
      ))}
      <div className="mt-1 flex items-center justify-between border-t border-dashed border-border pt-2 text-sm">
        <span>Total con IVA</span>
        <span className="font-mono">{formatoMoneda.format(total)}</span>
      </div>
      <Fila etiqueta="Anticipos" valor={`− ${formatoMoneda.format(anticipos)}`} />
      <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2.5">
        <span className="text-sm font-semibold">{saldo < 0 ? "Saldo a favor del cliente" : "Saldo por cobrar"}</span>
        <span className="font-mono text-xl font-semibold">{formatoMoneda.format(Math.abs(saldo))}</span>
      </div>
      <div className="mt-3">
        {factura ? (
          <Link href={`/facturas/${factura.id}`} className="text-sm underline underline-offset-4">
            Ver factura #{factura.numero}
          </Link>
        ) : estado === "TERMINADA" || estado === "ENTREGADA" ? (
          <GenerarFacturaForm ordenId={ordenId} />
        ) : estado === "ANULADA" ? null : (
          <p className="text-xs text-muted-foreground">Factura: al terminar</p>
        )}
      </div>
    </div>
  );
}
