import type { ComponentProps } from "react";
import { ChevronsDown, ChevronsUp, Equal, Siren, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ETIQUETA_PRIORIDAD } from "@/lib/orden/flujo";
import { cn } from "@/lib/utils";
import type { PrioridadOrden } from "@/generated/prisma-tenant";
import { PRIORIDAD_BADGE_CLASSNAME, PRIORIDAD_COLOR } from "./prioridad-tono";

/** Ícono de cada nivel: se reconoce de un vistazo sin leer la etiqueta. */
export const PRIORIDAD_ICONO: Record<PrioridadOrden, LucideIcon> = {
  BAJA: ChevronsDown,
  NORMAL: Equal,
  ALTA: ChevronsUp,
  URGENTE: Siren,
};

/** Chip de la prioridad con su punto de color, igual que los demás chips de la app. */
export function PrioridadBadge({
  prioridad,
  className,
  ...props
}: { prioridad: PrioridadOrden } & Omit<ComponentProps<typeof Badge>, "children">) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", PRIORIDAD_BADGE_CLASSNAME[prioridad], className)} {...props}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: PRIORIDAD_COLOR[prioridad] }} />
      {ETIQUETA_PRIORIDAD[prioridad]}
    </Badge>
  );
}
