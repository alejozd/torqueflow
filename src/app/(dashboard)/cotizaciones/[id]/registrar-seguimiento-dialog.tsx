"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { RegistrarSeguimientoForm } from "./registrar-seguimiento-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RegistrarSeguimientoDialog({ cotizacionId }: { cotizacionId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus />
        Registrar seguimiento
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar seguimiento</DialogTitle>
          <DialogDescription>Registra un contacto o nota de seguimiento para esta cotización.</DialogDescription>
        </DialogHeader>
        <RegistrarSeguimientoForm cotizacionId={cotizacionId} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
