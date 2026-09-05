"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { NuevaCotizacionForm } from "./nueva-cotizacion-form";
import type { VehiculoOption } from "@/app/actions/cotizacion-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NuevaCotizacionDialog({ vehiculos }: { vehiculos: VehiculoOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        Nueva cotización
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva cotización</DialogTitle>
          <DialogDescription>Selecciona el vehículo y describe el motivo de la cotización.</DialogDescription>
        </DialogHeader>
        <NuevaCotizacionForm vehiculos={vehiculos} />
      </DialogContent>
    </Dialog>
  );
}
