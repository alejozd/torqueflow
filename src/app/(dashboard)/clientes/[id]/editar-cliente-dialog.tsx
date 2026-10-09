"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteClienteFormAction } from "@/app/actions/cliente-actions";
import { EliminarConConfirmacion } from "@/components/eliminar-con-confirmacion";
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

export function EditarClienteDialog({ cliente, puedeEliminar = false }: { cliente: Cliente; puedeEliminar?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Editar</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {cliente.nombre}</DialogTitle>
          <DialogDescription>Los cambios se reflejan de inmediato en sus vehículos y órdenes.</DialogDescription>
        </DialogHeader>
        <EditarClienteForm cliente={cliente} />
        {puedeEliminar ? (
          <EliminarConConfirmacion
            etiqueta="Eliminar cliente"
            confirmacion={`¿Eliminar a ${cliente.nombre}? Solo es posible si no tiene historial, y no se puede deshacer.`}
            accion={() => deleteClienteFormAction(cliente.id, { error: null, success: false })}
            onEliminado={() => {
              toast.success(`Cliente ${cliente.nombre} eliminado`);
              router.push("/clientes");
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
