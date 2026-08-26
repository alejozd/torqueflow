"use client";

import { useState } from "react";
import { EditarClienteForm } from "./editar-cliente-form";
import type { Cliente } from "@/generated/prisma-tenant";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditarClienteDialog({ cliente }: { cliente: Cliente }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Editar</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {cliente.nombre}</DialogTitle>
          <DialogDescription>Los cambios se reflejan de inmediato en sus vehículos y órdenes.</DialogDescription>
        </DialogHeader>
        <EditarClienteForm cliente={cliente} />
      </DialogContent>
    </Dialog>
  );
}
