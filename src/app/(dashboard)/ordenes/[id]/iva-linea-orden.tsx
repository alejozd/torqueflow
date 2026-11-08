"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cambiarIvaLineaOrdenAction } from "@/app/actions/item-orden-actions";
import { textoPorcentaje } from "@/lib/iva/tarifas";
import { SelectorIva } from "@/components/selector-iva";

/**
 * Celda de IVA de una línea de la orden: selector mientras la orden se puede
 * modificar, solo el porcentaje cuando ya no.
 */
export function IvaLineaOrden({
  ordenId,
  tipo,
  lineaId,
  descripcion,
  ivaPct,
  editable,
}: {
  ordenId: string;
  tipo: "REPUESTO" | "MANO_OBRA";
  lineaId: string;
  descripcion: string;
  ivaPct: number;
  editable: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  if (!editable) {
    return <span className="font-mono text-sm text-muted-foreground">{textoPorcentaje(ivaPct)}</span>;
  }

  return (
    <SelectorIva
      compacto
      size="sm"
      etiqueta={`IVA de ${descripcion}`}
      value={ivaPct}
      disabled={pendiente}
      onChange={(nuevo) => {
        if (nuevo === ivaPct) return;
        startTransition(async () => {
          const resultado = await cambiarIvaLineaOrdenAction(ordenId, tipo, lineaId, nuevo);
          if (resultado.error) {
            toast.error(resultado.error);
            return;
          }
          router.refresh();
        });
      }}
      className="ml-auto w-[84px] px-1.5 font-mono text-xs"
    />
  );
}
