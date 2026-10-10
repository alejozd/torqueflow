"use client";

import { useRouter } from "next/navigation";
import { eliminarItemCotizacionFormAction } from "@/app/actions/cotizacion-actions";
import { QuitarConConfirmacion } from "@/components/quitar-con-confirmacion";

export function EliminarItemCotizacionButton({ itemId, cotizacionId }: { itemId: string; cotizacionId: string }) {
  const router = useRouter();

  return (
    <QuitarConConfirmacion
      etiqueta="Quitar ítem"
      pregunta="¿Quitar este ítem de la cotización?"
      accion={() => eliminarItemCotizacionFormAction(itemId, cotizacionId)}
      onQuitado={() => router.refresh()}
    />
  );
}
