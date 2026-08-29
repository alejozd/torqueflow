"use client";

import { NuevoRepuestoForm } from "./nuevo-repuesto-form";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Controlled from the outside (open/onOpenChange), with no DialogTrigger of
 * its own -- unlike NuevoVehiculoDialog, this one is opened programmatically
 * by AgregarItemForm's Combobox ("+ Crear repuesto nuevo"), not by a button
 * that lives next to it.
 */
export function NuevoRepuestoDialog({
  open,
  onOpenChange,
  bodegas,
  proveedores,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bodegas: Bodega[];
  proveedores: Proveedor[];
  onCreated: (repuestoId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo repuesto</DialogTitle>
          <DialogDescription>Se agrega al inventario y queda seleccionado en este ítem.</DialogDescription>
        </DialogHeader>
        <NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}
