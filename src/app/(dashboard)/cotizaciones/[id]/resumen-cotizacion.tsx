import type { ReactNode } from "react";
import { Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TituloSeccion } from "@/components/titulo-seccion";
import { formatoPesos } from "./formato";

/**
 * Resumen económico: repuestos y mano de obra con los mismos colores de la
 * tabla, el descuento en rojo y el total destacado. `editorDescuento` solo
 * llega mientras la cotización se puede modificar.
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
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center justify-between">
          <TituloSeccion icono={Calculator}>Resumen económico</TituloSeccion>
          <span className="font-mono text-xs font-normal text-muted-foreground">COP</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        <Fila
          etiqueta={
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[oklch(0.7_0.15_60)]" />
              Repuestos
            </span>
          }
          valor={formatoPesos(subtotalRepuestos)}
        />
        <Fila
          etiqueta={
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[oklch(0.44_0.12_250)]" />
              Mano de obra
            </span>
          }
          valor={formatoPesos(subtotalManoObra)}
        />
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2.5 pb-1.5 text-sm font-semibold">
          <span>Subtotal</span>
          <span className="font-mono">{formatoPesos(subtotal)}</span>
        </div>

        {editorDescuento ? <div className="-mx-6 my-1.5 bg-muted/40 px-6 py-3">{editorDescuento}</div> : null}
        {descuento > 0 ? (
          <div className="flex items-center justify-between py-1.5 text-sm text-destructive">
            <span>{etiquetaDescuento}</span>
            <span className="font-mono">−{formatoPesos(descuento)}</span>
          </div>
        ) : null}

        <Fila etiqueta="IVA (19 %)" valor={formatoPesos(iva)} />

        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 rounded-lg bg-primary/10 px-3 py-3 ring-1 ring-primary/20">
          <div>
            <p className="text-xs font-bold tracking-wide text-primary uppercase">Total cotizado</p>
            <p className="text-xs text-muted-foreground">Incluye IVA</p>
          </div>
          <span className="font-mono text-xl font-bold whitespace-nowrap text-primary">{formatoPesos(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: ReactNode; valor: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="font-mono">{valor}</span>
    </div>
  );
}
