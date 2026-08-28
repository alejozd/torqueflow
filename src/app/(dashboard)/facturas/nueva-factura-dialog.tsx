"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { NuevaFacturaForm } from "./nueva-factura-form";
import type { OrdenFacturableOption } from "@/app/actions/factura-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NuevaFacturaDialog({ ordenes }: { ordenes: OrdenFacturableOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        Nueva factura
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva factura</DialogTitle>
          <DialogDescription>Selecciona la orden terminada o entregada que vas a facturar.</DialogDescription>
        </DialogHeader>
        <NuevaFacturaForm ordenes={ordenes} />
      </DialogContent>
    </Dialog>
  );
}
