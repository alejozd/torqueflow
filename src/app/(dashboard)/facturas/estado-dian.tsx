import { Badge } from "@/components/ui/badge";
import { textoEstadoDian, type EstadoDian, type TonoDian } from "@/lib/factura-electronica/textos";
import type { AmbienteFacturaElectronica } from "@/generated/prisma-tenant";
import { cn } from "@/lib/utils";

const CLASE_TONO: Record<TonoDian, string> = {
  exito: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  alerta: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  error: "border-transparent bg-destructive/10 text-destructive",
  neutro: "",
};

export function InsigniaDian({ estado, ambiente }: { estado: EstadoDian; ambiente?: AmbienteFacturaElectronica | null }) {
  const t = textoEstadoDian(estado, ambiente);
  return (
    <Badge variant="outline" className={cn("text-[10px]", CLASE_TONO[t.tono])}>
      {t.etiqueta}
    </Badge>
  );
}
