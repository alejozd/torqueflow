"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  actualizarGastoRecurrenteAction,
  crearGastoRecurrenteAction,
  toggleGastoRecurrenteActivoAction,
  type PlantillaVista,
} from "@/app/actions/gasto-recurrente-actions";
import type { CategoriaGastoVista } from "@/app/actions/categoria-gasto-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { ETIQUETA_MES } from "@/lib/gastos/periodo";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

interface SedeOpcion {
  id: string;
  nombre: string;
}

function PlantillaDialog({
  plantilla,
  categorias,
  sedes,
  sedeIdPorDefecto,
}: {
  plantilla?: PlantillaVista;
  categorias: CategoriaGastoVista[];
  sedes: SedeOpcion[];
  sedeIdPorDefecto: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState(plantilla?.categoriaId ?? "");
  const [sedeId, setSedeId] = useState(plantilla?.sedeId ?? sedeIdPorDefecto);
  const [isPending, startTransition] = useTransition();
  const editando = Boolean(plantilla);

  const opcionesCategoria = categorias.map((c) => ({ value: c.id, label: c.nombre }));
  if (plantilla && !opcionesCategoria.some((o) => o.value === plantilla.categoriaId)) {
    opcionesCategoria.push({ value: plantilla.categoriaId, label: plantilla.categoriaNombre });
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    formData.set("categoriaId", categoriaId);
    formData.set("sedeId", sedeId);
    startTransition(async () => {
      try {
        const estado = { error: null, success: false };
        const result = plantilla
          ? await actualizarGastoRecurrenteAction(plantilla.id, estado, formData)
          : await crearGastoRecurrenteAction(estado, formData);
        if (result.success) {
          toast.success(editando ? "Plantilla actualizada" : "Plantilla creada");
          setOpen(false);
        } else {
          setError(result.error);
        }
      } catch {
        toast.error("No se pudo guardar la plantilla");
      }
    });
  }

  const id = plantilla?.id ?? "nueva";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={editando ? "outline" : "default"} />}>
        {editando ? "Editar" : "Nueva plantilla"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
          <DialogDescription>Gasto que se repite cada mes y se confirma desde la página de Gastos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`plt-sede-${id}`}>Sede</Label>
            <SelectField
              id={`plt-sede-${id}`}
              items={sedes.map((s) => ({ value: s.id, label: s.nombre }))}
              value={sedeId}
              onValueChange={setSedeId}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`plt-categoria-${id}`}>Categoría</Label>
            <SelectField
              id={`plt-categoria-${id}`}
              items={opcionesCategoria}
              value={categoriaId}
              onValueChange={setCategoriaId}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`plt-descripcion-${id}`}>Descripción</Label>
            <Input id={`plt-descripcion-${id}`} name="descripcion" defaultValue={plantilla?.descripcion ?? ""} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`plt-monto-${id}`}>Monto estimado</Label>
              <Input
                id={`plt-monto-${id}`}
                name="montoEstimado"
                type="number"
                min="1"
                step="1"
                className="font-mono"
                defaultValue={plantilla ? String(plantilla.montoEstimado) : ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`plt-dia-${id}`}>Día del mes</Label>
              <Input
                id={`plt-dia-${id}`}
                name="diaDelMes"
                type="number"
                min="1"
                max="28"
                step="1"
                defaultValue={plantilla ? String(plantilla.diaDelMes) : ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`plt-desde-${id}`}>Desde</Label>
              <Input id={`plt-desde-${id}`} name="desde" type="month" defaultValue={plantilla?.desde ?? ""} />
            </div>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : editando ? "Guardar cambios" : "Crear plantilla"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlantillasRecurrentesSection({
  plantillas,
  categorias,
  sedes,
  sedeIdPorDefecto,
}: {
  plantillas: PlantillaVista[];
  categorias: CategoriaGastoVista[];
  sedes: SedeOpcion[];
  sedeIdPorDefecto: string;
}) {
  const [isPending, startTransition] = useTransition();

  function alternar(id: string) {
    startTransition(async () => {
      try {
        const result = await toggleGastoRecurrenteActivoAction(id);
        if (result.error) toast.error(result.error);
      } catch {
        toast.error("No se pudo guardar la plantilla");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <PlantillaDialog categorias={categorias} sedes={sedes} sedeIdPorDefecto={sedeIdPorDefecto} />
      </div>
      {plantillas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay plantillas de gastos recurrentes.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {plantillas.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2 font-medium">
                  {p.descripcion}
                  {!p.activo ? <Badge variant="secondary">Inactiva</Badge> : null}
                </span>
                <span className="text-sm text-muted-foreground">
                  {p.sedeNombre} · {p.categoriaNombre} · {formatoMoneda.format(p.montoEstimado)} · Día {p.diaDelMes} ·
                  Desde {ETIQUETA_MES(p.desde)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <PlantillaDialog plantilla={p} categorias={categorias} sedes={sedes} sedeIdPorDefecto={sedeIdPorDefecto} />
                <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => alternar(p.id)}>
                  {p.activo ? "Desactivar" : "Activar"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
