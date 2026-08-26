"use client";

import { useState } from "react";
import { EditarSedeForm } from "./editar-sede-form";
import type { Sede } from "@/generated/prisma-tenant";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Fase 11-14: row-level "Editar" action opens EditarSedeForm (edit + delete,
 * both untouched) in a modal instead of it being permanently inline in the
 * table row -- keeps the redesigned Listado table compact and scannable.
 */
export function EditarSedeDialog({ sede }: { sede: Sede }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Editar</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {sede.nombre}</DialogTitle>
        </DialogHeader>
        <EditarSedeForm sede={sede} />
      </DialogContent>
    </Dialog>
  );
}
