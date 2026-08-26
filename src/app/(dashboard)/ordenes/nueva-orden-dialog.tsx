"use client";

import { useState } from "react";
import { NuevaOrdenDesdeCeroForm } from "./nueva-orden-desde-cero-form";
import type { ClienteParaOrden } from "@/app/actions/cliente-actions";
import type { TecnicoOption } from "@/app/actions/orden-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NuevaOrdenDialog({
  clientes,
  tecnicos,
}: {
  clientes: ClienteParaOrden[];
  tecnicos: TecnicoOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Nueva orden</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva orden de trabajo</DialogTitle>
          <DialogDescription>Vehículo, responsable y diagnóstico inicial.</DialogDescription>
        </DialogHeader>
        <NuevaOrdenDesdeCeroForm clientes={clientes} tecnicos={tecnicos} />
      </DialogContent>
    </Dialog>
  );
}
