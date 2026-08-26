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
      {/* Wider than the app's usual sm:max-w-lg dialog: the 6-column detail-fields
          grid (matching the Claude Design mockup) needs the extra room, e.g. so the
          Combustible/Transmisión selects don't clip their option text. */}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo vehículo</DialogTitle>
        </DialogHeader>
        <NuevoVehiculoForm clienteId={clienteId} />
      </DialogContent>
    </Dialog>
  );
}
