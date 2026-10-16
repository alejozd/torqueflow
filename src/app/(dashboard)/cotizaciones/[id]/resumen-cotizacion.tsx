import type { ReactNode } from "react";
import { ResumenEconomico } from "@/components/resumen-economico";

/**
 * Resumen económico de la cotización: repuestos y mano de obra con los mismos
 * colores de la tabla, el descuento en rojo y el total destacado. `editorDescuento`
 * solo llega mientras la cotización se puede modificar. Es el resumen compartido
 * (`components/resumen-economico.tsx`) con las filas de la cotización.
 */
export function ResumenCotizacion({
  subtotalRepuestos,
  subtotalManoObra,
  subtotal,
  descuento,
  etiquetaDescuento,
  iva,
  total,
  editorDescuento,
}: {
  subtotalRepuestos: number;
  subtotalManoObra: number;
  subtotal: number;
  descuento: number;
  etiquetaDescuento: string;
  iva: number;
  total: number;
  editorDescuento?: ReactNode;
}) {
  return (
    <ResumenEconomico
      filas={[
        { etiqueta: "Repuestos", valor: subtotalRepuestos, colorPunto: "bg-[oklch(0.7_0.15_60)]" },
        { etiqueta: "Mano de obra", valor: subtotalManoObra, colorPunto: "bg-[oklch(0.44_0.12_250)]" },
      ]}
      subtotal={subtotal}
      descuento={descuento}
      etiquetaDescuento={etiquetaDescuento}
      iva={iva}
      total={total}
      etiquetaTotal="Total cotizado"
      editorDescuento={editorDescuento}
    />
  );
}
