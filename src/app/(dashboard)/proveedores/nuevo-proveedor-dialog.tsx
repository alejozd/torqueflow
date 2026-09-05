"use client";

import { useState } from "react";
import { NuevoProveedorForm } from "./nuevo-proveedor-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NuevoProveedorDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Nuevo proveedor</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo proveedor</DialogTitle>
          <DialogDescription>Registra los datos del proveedor para asociarlo a repuestos y entradas.</DialogDescription>
        </DialogHeader>
        <NuevoProveedorForm onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
