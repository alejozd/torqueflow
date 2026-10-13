import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { coberturaDe } from "@/lib/garantias/cobertura";
import { ETIQUETA_VIGENCIA, type EstadoGarantia } from "@/lib/garantias/vigencia";

export interface GarantiaDelVehiculo {
  id: string;
  tipo: "TRABAJO" | "REPUESTO";
  descripcion: string;
  linea: string | null;
  cubreHasta: Date | null;
  cubreHastaKm: number | null;
  nota: string | null;
  registradaAt: Date;
  ordenId: string;
  sede: string;
  estado: EstadoGarantia;
}

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });

const VARIANTE: Record<EstadoGarantia, "default" | "secondary" | "outline"> = {
  VIGENTE: "default",
  VENCIDA: "secondary",
  SIN_COBERTURA: "outline",
};

/**
 * Garantías del vehículo (D3): se consultan todas, de cualquier sede, porque el
 * vehículo es del taller. La vigencia la calcula `listGarantiasDeVehiculo`.
 */
export function GarantiasCard({ garantias }: { garantias: GarantiaDelVehiculo[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Garantías{" "}
          <span className="font-normal text-muted-foreground">
            · {garantias.length} {garantias.length === 1 ? "registro" : "registros"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {garantias.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este vehículo no tiene garantías registradas. Se registran al entregar una orden.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {garantias.map((garantia) => (
              <li key={garantia.id} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{garantia.descripcion}</span>
                  <Badge variant={VARIANTE[garantia.estado]}>{ETIQUETA_VIGENCIA[garantia.estado]}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {garantia.tipo === "TRABAJO" ? "Trabajo" : "Repuesto"}
                    {garantia.linea ? ` · ${garantia.linea}` : ""}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {coberturaDe(garantia)} · registrada el {formatoFecha.format(garantia.registradaAt)} en{" "}
                  {garantia.sede} ·{" "}
                  <Link href={`/ordenes/${garantia.ordenId}`} className="underline underline-offset-4">
                    ver la orden
                  </Link>
                </div>
                {garantia.nota ? <p className="text-xs text-muted-foreground">{garantia.nota}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
