"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  cambiarActivaTarifaIvaAction,
  crearTarifaIvaAction,
  marcarPredeterminadaTarifaIvaAction,
  renombrarTarifaIvaAction,
} from "@/app/actions/tarifa-iva-actions";
import { textoPorcentaje, type TarifaIvaVista } from "@/lib/iva/tarifas";
import type { ResultadoAccion } from "@/lib/resultado-accion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const INICIAL: ResultadoAccion = { error: null, success: false };

export function TarifasIvaPanel({ tarifas }: { tarifas: TarifaIvaVista[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th className="w-24 px-3 py-2 font-medium">IVA</th>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="w-28 px-3 py-2 font-medium">Estado</th>
              <th className="w-64 px-3 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tarifas.map((tarifa) => (
              <FilaTarifa key={tarifa.id} tarifa={tarifa} />
            ))}
          </tbody>
        </table>
      </div>

      <NuevaTarifaForm />
    </div>
  );
}

function FilaTarifa({ tarifa }: { tarifa: TarifaIvaVista }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(tarifa.nombre);
  const [pendiente, startTransition] = useTransition();

  function ejecutar(accion: () => Promise<ResultadoAccion>, exito: string) {
    startTransition(async () => {
      const resultado = await accion();
      if (resultado.error) {
        toast.error(resultado.error);
        setNombre(tarifa.nombre);
        return;
      }
      toast.success(exito);
      router.refresh();
    });
  }

  function guardarNombre() {
    const limpio = nombre.trim();
    if (limpio === tarifa.nombre) return;
    ejecutar(() => renombrarTarifaIvaAction(tarifa.id, limpio), "Nombre actualizado");
  }

  return (
    <tr className={cn("border-t border-border", !tarifa.activa && "text-muted-foreground")}>
      <td className="px-3 py-2 font-mono font-semibold">{textoPorcentaje(tarifa.porcentaje)}</td>
      <td className="px-3 py-2">
        <Input
          aria-label={`Nombre de la tarifa ${textoPorcentaje(tarifa.porcentaje)}`}
          value={nombre}
          maxLength={40}
          disabled={pendiente}
          onChange={(event) => setNombre(event.target.value)}
          onBlur={guardarNombre}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setNombre(tarifa.nombre);
          }}
          className="h-8"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {tarifa.predeterminada ? (
            <Badge className="border-transparent bg-primary/10 text-primary">Predeterminada</Badge>
          ) : null}
          {!tarifa.activa ? <Badge variant="outline">Inactiva</Badge> : null}
          {tarifa.activa && !tarifa.predeterminada ? <Badge variant="outline">Activa</Badge> : null}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1.5">
          {tarifa.activa && !tarifa.predeterminada ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pendiente}
              onClick={() => ejecutar(() => marcarPredeterminadaTarifaIvaAction(tarifa.id), "Tarifa predeterminada actualizada")}
            >
              Hacer predeterminada
            </Button>
          ) : null}
          {tarifa.predeterminada ? null : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pendiente}
              onClick={() =>
                ejecutar(
                  () => cambiarActivaTarifaIvaAction(tarifa.id, !tarifa.activa),
                  tarifa.activa ? "Tarifa desactivada" : "Tarifa activada",
                )
              }
            >
              {tarifa.activa ? "Desactivar" : "Activar"}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function NuevaTarifaForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, formAction, pendiente] = useActionState(crearTarifaIvaAction, INICIAL);

  useEffect(() => {
    if (estado.success) {
      toast.success("Tarifa agregada");
      formRef.current?.reset();
      router.refresh();
    }
  }, [estado, router]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-3 rounded-lg bg-muted/30 p-3">
      <p className="text-sm font-medium">Agregar tarifa</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-28 flex-col gap-1.5">
          <Label htmlFor="porcentaje">Porcentaje</Label>
          <div className="relative">
            <Input id="porcentaje" name="porcentaje" inputMode="decimal" placeholder="8" className="pr-7 font-mono" />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
        </div>
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" name="nombre" maxLength={40} placeholder="Ej: Especial" />
        </div>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Agregando..." : "Agregar"}
        </Button>
      </div>
      {estado.error ? (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
