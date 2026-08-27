"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { NuevaCitaForm } from "./nueva-cita-form";
import type { VehiculoOption } from "@/app/actions/cita-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NuevaCitaDialog({ vehiculos }: { vehiculos: VehiculoOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        Nueva cita
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
          <DialogDescription>Vehículo, fecha y motivo del servicio.</DialogDescription>
        </DialogHeader>
        <NuevaCitaForm vehiculos={vehiculos} onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
