import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatoFechaVencimiento, type EstadoVencimiento } from "@/lib/vencimientos/estado-vencimiento";

const ETIQUETA: Record<EstadoVencimiento, string> = {
  SIN_DATO: "Sin registrar",
  VIGENTE: "Vigente",
  POR_VENCER: "Por vencer",
  PROXIMO: "Vence pronto",
  VENCIDO: "Vencido",
};

const DOT: Record<EstadoVencimiento, string> = {
  SIN_DATO: "oklch(0.7 0 0)",
  VIGENTE: "oklch(0.4 0.1 150)",
  POR_VENCER: "oklch(0.7 0.15 85)",
  PROXIMO: "oklch(0.55 0.15 60)",
  VENCIDO: "oklch(0.5 0.2 27)",
};

const CLASE: Record<EstadoVencimiento, string> = {
  SIN_DATO: "",
  VIGENTE: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  POR_VENCER: "border-transparent bg-[oklch(0.7_0.15_85/0.15)] text-[oklch(0.5_0.12_85)]",
  PROXIMO: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  VENCIDO: "border-transparent bg-[oklch(0.5_0.2_27/0.1)] text-[oklch(0.5_0.2_27)]",
};

export function VencimientoBadge({ estado, fecha }: { estado: EstadoVencimiento; fecha: Date | null }) {
  return (
    <Badge variant={estado === "SIN_DATO" ? "outline" : "default"} className={cn("gap-1.5", CLASE[estado])}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: DOT[estado] }} />
      {ETIQUETA[estado]}
      {fecha ? <span className="font-mono">· {formatoFechaVencimiento.format(fecha)}</span> : null}
    </Badge>
  );
}
