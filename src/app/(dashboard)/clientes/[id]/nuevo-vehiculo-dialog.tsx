"use client";

import { useState } from "react";
import { NuevoVehiculoForm } from "./nuevo-vehiculo-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function NuevoVehiculoDialog({ clienteId }: { clienteId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>+ Vehículo</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo vehículo</DialogTitle>
        </DialogHeader>
        <NuevoVehiculoForm clienteId={clienteId} />
      </DialogContent>
    </Dialog>
  );
}
