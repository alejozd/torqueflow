"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { eliminarItemCotizacionAction } from "@/app/actions/cotizacion-actions";
import { Button } from "@/components/ui/button";

export function EliminarItemCotizacionButton({ itemId, cotizacionId }: { itemId: string; cotizacionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        await eliminarItemCotizacionAction(itemId, cotizacionId);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al quitar el ítem");
      }
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={onClick} aria-label="Quitar ítem">
      <X className="size-4" />
    </Button>
  );
}
