import type { ReactNode } from "react";
import { Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TituloSeccion } from "@/components/titulo-seccion";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Una fila previa al subtotal (en la cotización: repuestos y mano de obra con su color). */
export interface FilaResumen {
  etiqueta: string;
  valor: number;
  /** Clase de fondo del punto de color; sin ella la fila va sin punto. */
  colorPunto?: string;
}

/**
 * Resumen económico compartido por la cotización y el mostrador: filas
 * opcionales, subtotal, editor de descuento, el descuento en rojo, IVA y el
 * total destacado. `editorDescuento` solo llega cuando el descuento se puede cambiar.
 */
export function ResumenEconomico({
  titulo = "Resumen económico",
  encabezado,
  filas = [],
  subtotal,
  descuento,
  etiquetaDescuento,
  iva,
  total,
  etiquetaTotal,
  notaTotal = "Incluye IVA",
  editorDescuento,
}: {
  titulo?: string;
  /** Línea bajo el título (el mostrador pone "4 productos · 8 unidades"). */
  encabezado?: ReactNode;
  filas?: FilaResumen[];
  subtotal: number;
  descuento: number;
  etiquetaDescuento: string;
  iva: number;
  total: number;
  etiquetaTotal: string;
  notaTotal?: string;
  editorDescuento?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center justify-between">
          <TituloSeccion icono={Calculator}>{titulo}</TituloSeccion>
          <span className="font-mono text-xs font-normal text-muted-foreground">COP</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {encabezado ? <p className="pb-1.5 text-sm text-muted-foreground">{encabezado}</p> : null}
        {filas.map((fila) => (
          <Fila
            key={fila.etiqueta}
            etiqueta={
              fila.colorPunto ? (
                <span className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${fila.colorPunto}`} />
                  {fila.etiqueta}
                </span>
              ) : (
                fila.etiqueta
              )
            }
            valor={formatoMoneda.format(fila.valor)}
          />
        ))}
        <div
          className={
            filas.length > 0
              ? "mt-1 flex items-center justify-between border-t border-border pt-2.5 pb-1.5 text-sm font-semibold"
              : "flex items-center justify-between pb-1.5 text-sm font-semibold"
          }
        >
          <span>Subtotal</span>
          <span className="font-mono">{formatoMoneda.format(subtotal)}</span>
        </div>

        {editorDescuento ? <div className="-mx-6 my-1.5 bg-muted/40 px-6 py-3">{editorDescuento}</div> : null}
        {descuento > 0 ? (
          <div className="flex items-center justify-between py-1.5 text-sm text-destructive">
            <span>{etiquetaDescuento}</span>
            <span className="font-mono">−{formatoMoneda.format(descuento)}</span>
          </div>
        ) : null}

        <Fila etiqueta="IVA (19 %)" valor={formatoMoneda.format(iva)} />

        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 rounded-lg bg-primary/10 px-3 py-3 ring-1 ring-primary/20">
          <div>
            <p className="text-xs font-bold tracking-wide text-primary uppercase">{etiquetaTotal}</p>
            <p className="text-xs text-muted-foreground">{notaTotal}</p>
          </div>
          <span data-testid="total-resumen" className="font-mono text-xl font-bold whitespace-nowrap text-primary">
            {formatoMoneda.format(total)}
          </span>
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
