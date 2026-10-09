"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { EditarVehiculoForm } from "./editar-vehiculo-form";
import { deleteVehiculoFormAction } from "@/app/actions/vehiculo-actions";
import { EliminarConConfirmacion } from "@/components/eliminar-con-confirmacion";
import type { MarcaVehiculo, ModeloVehiculo, Vehiculo } from "@/generated/prisma-tenant";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditarVehiculoDialog({
  vehiculo,
  marcas,
  modelos,
  esAdmin,
  triggerClassName,
  puedeEliminar = false,
}: {
  vehiculo: Vehiculo;
  marcas: MarcaVehiculo[];
  modelos: ModeloVehiculo[];
  esAdmin: boolean;
  /** ADMIN/RECEPCION only, same roles as deleteVehiculoAction. */
  puedeEliminar?: boolean;
  /** Overrides the trigger's default outline look -- e.g. clientes/[id]'s vehicle cards use a soft amber style. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className={triggerClassName} />}>
        <Pencil />
        Editar
      </DialogTrigger>
      {/* Wider than the app's usual sm:max-w-lg dialog: same 6-column detail-fields
          grid as NuevoVehiculoDialog. */}
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar {vehiculo.placa}</DialogTitle>
          <DialogDescription>Los cambios se reflejan en el historial y en las órdenes abiertas.</DialogDescription>
        </DialogHeader>
        <EditarVehiculoForm
          vehiculo={vehiculo}
          marcas={marcas}
          modelos={modelos}
          esAdmin={esAdmin}
          onUpdated={() => setOpen(false)}
        />
        {puedeEliminar ? (
          <EliminarConConfirmacion
            etiqueta="Eliminar vehículo"
            confirmacion={`¿Eliminar el vehículo ${vehiculo.placa}? Solo es posible si no tiene historial, y no se puede deshacer.`}
            accion={() => deleteVehiculoFormAction(vehiculo.id, vehiculo.clienteId, { error: null, success: false })}
            onEliminado={() => {
              toast.success(`Vehículo ${vehiculo.placa} eliminado`);
              setOpen(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
