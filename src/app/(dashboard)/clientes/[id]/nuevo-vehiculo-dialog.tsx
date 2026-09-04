"use client";

import { useState } from "react";
import { NuevoVehiculoForm } from "./nuevo-vehiculo-form";
import type { MarcaVehiculo, ModeloVehiculo } from "@/generated/prisma-tenant";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NuevoVehiculoDialog({
  clienteId,
  marcas,
  modelos,
  esAdmin,
}: {
  clienteId: string;
  marcas: MarcaVehiculo[];
  modelos: ModeloVehiculo[];
  esAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>+ Vehículo</DialogTrigger>
      {/* Wider than the app's usual sm:max-w-lg dialog: the 6-column detail-fields
          grid (matching the Claude Design mockup) needs the extra room, e.g. so the
          Combustible/Transmisión selects don't clip their option text. */}
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nuevo vehículo</DialogTitle>
          <DialogDescription>Queda asociado a este cliente y a su historial de órdenes.</DialogDescription>
        </DialogHeader>
        <NuevoVehiculoForm clienteId={clienteId} marcas={marcas} modelos={modelos} esAdmin={esAdmin} />
      </DialogContent>
    </Dialog>
  );
}
