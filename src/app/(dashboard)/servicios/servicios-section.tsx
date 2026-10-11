"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleServicioActivoAction, type ServicioVista } from "@/app/actions/servicio-actions";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KitRepuestosEditor } from "./kit-repuestos-editor";
import { ServicioDialog } from "./servicio-dialog";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });

function FilaServicio({ servicio, repuestos }: { servicio: ServicioVista; repuestos: RepuestoOption[] }) {
  const [abierto, setAbierto] = useState(false);
  const [isPending, startTransition] = useTransition();
  const esKit = servicio.repuestos.length > 0;

  function toggle() {
    startTransition(async () => {
      try {
        const result = await toggleServicioActivoAction(servicio.id);
        if (result.error) toast.error(result.error);
        else toast.success(servicio.activo ? "Servicio desactivado" : "Servicio activado");
      } catch {
        toast.error("No se pudo actualizar el servicio");
      }
    });
  }

  return (
    <li className="rounded-md border">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <span className={servicio.activo ? "font-medium" : "font-medium text-muted-foreground"}>{servicio.nombre}</span>
        {esKit ? <Badge variant="secondary">Kit · {servicio.repuestos.length}</Badge> : null}
        {!servicio.activo ? <Badge variant="secondary">Inactivo</Badge> : null}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          Mano de obra {formatoMoneda.format(servicio.precioManoObra)} · Total estimado{" "}
          {formatoMoneda.format(servicio.totalEstimado)}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(!abierto)}>
          {abierto ? "Ocultar repuestos" : `Repuestos del kit (${servicio.repuestos.length})`}
        </Button>
        <ServicioDialog modo="editar" servicio={servicio} />
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={toggle}>
          {servicio.activo ? "Desactivar" : "Activar"}
        </Button>
      </div>
      {servicio.descripcion ? (
        <p className="px-2 pb-2 text-xs text-muted-foreground">{servicio.descripcion}</p>
      ) : null}
      {abierto ? (
        <div className="border-t border-border p-3">
          <KitRepuestosEditor servicio={servicio} repuestos={repuestos} />
        </div>
      ) : null}
    </li>
  );
}

export function ServiciosSection({
  servicios,
  repuestos,
}: {
  servicios: ServicioVista[];
  repuestos: RepuestoOption[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <ServicioDialog modo="crear" />
      </div>
      {servicios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay servicios en el catálogo. Crea el primero para prellenar mano de obra y repuestos en las órdenes.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {servicios.map((servicio) => (
            <FilaServicio key={servicio.id} servicio={servicio} repuestos={repuestos} />
          ))}
        </ul>
      )}
    </div>
  );
}
