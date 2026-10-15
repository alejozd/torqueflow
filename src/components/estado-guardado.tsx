import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type FaseGuardado = "inactivo" | "guardando" | "guardado" | "error";

/**
 * Aviso de guardado de un bloque que se guarda solo (checklist, recepción,
 * mecánico): cada bloque dice lo suyo, nunca un «guardado hace X» de toda la página.
 */
export function EstadoGuardado({
  fase,
  error,
  className,
}: {
  fase: FaseGuardado;
  error?: string | null;
  className?: string;
}) {
  if (fase === "inactivo") return null;
  if (fase === "error") {
    return (
      <span role="alert" className={cn("text-xs text-destructive", className)}>
        {error ?? "No se pudo guardar"}
      </span>
    );
  }
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        fase === "guardado" ? "text-[oklch(0.4_0.1_150)]" : "text-muted-foreground",
        className,
      )}
    >
      {fase === "guardando" ? (
        "Guardando…"
      ) : (
        <>
          <Check className="size-3" aria-hidden />
          Guardado
        </>
      )}
    </span>
  );
}
