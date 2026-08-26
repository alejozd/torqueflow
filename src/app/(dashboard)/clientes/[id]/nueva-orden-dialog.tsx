"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { NuevaOrdenForm } from "../../vehiculos/[id]/nueva-orden-form";
import type { TecnicoOption } from "@/app/actions/orden-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Reuses vehiculos/[id]'s NuevaOrdenForm as-is (same createOrdenAction, same
// clienteId/vehiculoId binding) -- only where it renders is new: a modal
// triggered right from the cliente's vehicle card instead of the vehículo's
// own page, so cliente+vehículo are already fixed and nothing needs picking.
export function NuevaOrdenDialog({
  clienteId,
  vehiculoId,
  placa,
  tecnicos,
}: {
  clienteId: string;
  vehiculoId: string;
  placa: string;
  tecnicos: TecnicoOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus />
        Orden
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva orden · {placa}</DialogTitle>
        </DialogHeader>
        <NuevaOrdenForm
          clienteId={clienteId}
          vehiculoId={vehiculoId}
          tecnicos={tecnicos}
          onCreated={(ordenId) => {
            // Straight to the órden the user just opened -- otherwise they'd
            // have to go find it in /ordenes' list before they could add
            // repuestos, mano de obra, or fotos to it.
            setOpen(false);
            router.push(`/ordenes/${ordenId}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
