import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONOS = {
  naranja: "bg-primary/12 text-primary",
  azul: "bg-[oklch(0.44_0.12_250/0.12)] text-[oklch(0.44_0.12_250)]",
  verde: "bg-[oklch(0.55_0.13_150/0.14)] text-[oklch(0.45_0.12_150)]",
  gris: "bg-foreground/[0.07] text-foreground/70",
} as const;

export type TonoSeccion = keyof typeof TONOS;

/**
 * Título de una tarjeta con su ícono en un cuadrito de color: le da peso a
 * cada sección para que no todas se lean iguales. Va dentro de CardTitle.
 */
export function TituloSeccion({
  icono: Icono,
  tono = "gris",
  children,
  detalle,
}: {
  icono: LucideIcon;
  tono?: TonoSeccion;
  children: ReactNode;
  /** Texto corto al lado del título, p. ej. «3 ítems». */
  detalle?: ReactNode;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TONOS[tono])}>
        <Icono className="size-4" aria-hidden />
      </span>
      <span className="text-base font-semibold">{children}</span>
      {detalle ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{detalle}</span>
      ) : null}
    </span>
  );
}
