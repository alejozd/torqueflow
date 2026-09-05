"use client";

import { useState } from "react";
import { EditarSedeForm } from "./editar-sede-form";
import type { Sede } from "@/generated/prisma-tenant";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Row-level edit action: rendered inside the "Sede" column's cell, but the
 * trigger stretches over the whole row (absolute inset-0, sized against the
 * row's own `position: relative` set via DataTable's rowClickable) -- same
 * "click anywhere in the row" convention as the rowHref-based tables
 * (Clientes, Órdenes, etc.), just opening a Dialog instead of navigating.
 */
export function EditarSedeDialog({ sede }: { sede: Sede }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button type="button" className="absolute inset-0 z-10" />}>
        <span className="sr-only">Editar {sede.nombre}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {sede.nombre}</DialogTitle>
          <DialogDescription>Los cambios aplican de inmediato a esta sede.</DialogDescription>
        </DialogHeader>
        <EditarSedeForm sede={sede} />
      </DialogContent>
    </Dialog>
  );
}
