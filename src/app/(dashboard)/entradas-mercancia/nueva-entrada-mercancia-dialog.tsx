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
  defaultOpen = false,
  defaultProveedorId,
  defaultBodegaId,
}: {
  proveedores: Proveedor[];
  bodegas: Bodega[];
  defaultOpen?: boolean;
  defaultProveedorId?: string;
  defaultBodegaId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  function onOpenChange(siguiente: boolean) {
    setOpen(siguiente);
    // Opened from the dashboard via ?nueva=1: drop the params on close so a
    // refresh doesn't pop the dialog open again.
    if (!siguiente && defaultOpen && window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
        <NuevaEntradaMercanciaForm
          proveedores={proveedores}
          bodegas={bodegas}
          defaultProveedorId={defaultProveedorId}
          defaultBodegaId={defaultBodegaId}
        />
      </DialogContent>
    </Dialog>
  );
}
