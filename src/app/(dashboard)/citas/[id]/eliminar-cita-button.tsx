"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteCitaFormAction } from "@/app/actions/cita-actions";
import { EliminarConConfirmacion } from "@/components/eliminar-con-confirmacion";

/** ADMIN-only (deleteCitaAction's role). For a mistaken entry; a no-show is "Cancelada", not a delete. */
export function EliminarCitaButton({ citaId, descripcion }: { citaId: string; descripcion: string }) {
  const router = useRouter();

  return (
    <EliminarConConfirmacion
      etiqueta="Eliminar cita"
      confirmacion={`¿Eliminar la cita ${descripcion}? Para una cita que no se hizo, usa el estado Cancelada. No se puede deshacer.`}
      accion={() => deleteCitaFormAction(citaId)}
      onEliminado={() => {
        toast.success("Cita eliminada");
        router.push("/citas");
      }}
    />
  );
}
