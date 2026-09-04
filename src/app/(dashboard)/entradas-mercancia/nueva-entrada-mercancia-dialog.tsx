"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { NuevaEntradaMercanciaForm } from "./nueva-entrada-mercancia-form";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NuevaEntradaMercanciaDialog({
  proveedores,
  bodegas,
}: {
  proveedores: Proveedor[];
  bodegas: Bodega[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        Nueva entrada
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva entrada de mercancía</DialogTitle>
          <DialogDescription>
            Registra el proveedor y la bodega; los ítems recibidos se agregan en el detalle de la entrada.
          </DialogDescription>
        </DialogHeader>
        <NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />
      </DialogContent>
    </Dialog>
  );
}
