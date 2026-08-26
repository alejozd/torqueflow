"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { EditarVehiculoForm } from "./editar-vehiculo-form";
import type { Vehiculo } from "@/generated/prisma-tenant";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditarVehiculoDialog({ vehiculo }: { vehiculo: Vehiculo }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
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
        <EditarVehiculoForm vehiculo={vehiculo} />
      </DialogContent>
    </Dialog>
  );
}
