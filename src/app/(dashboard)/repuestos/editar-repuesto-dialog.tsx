"use client";

import { useState } from "react";
import { EditarRepuestoForm, type RepuestoEditable } from "./editar-repuesto-form";
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

export function EditarRepuestoDialog({
  repuesto,
  bodegas,
  proveedores,
}: {
  repuesto: RepuestoEditable;
  bodegas: Bodega[];
  proveedores: Proveedor[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Editar</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {repuesto.nombre}</DialogTitle>
          <DialogDescription>Los cambios aplican de inmediato a este repuesto. Al eliminarlo, quedará desvinculado de las órdenes de trabajo que lo hayan usado.</DialogDescription>
        </DialogHeader>
        <EditarRepuestoForm repuesto={repuesto} bodegas={bodegas} proveedores={proveedores} />
      </DialogContent>
    </Dialog>
  );
}
