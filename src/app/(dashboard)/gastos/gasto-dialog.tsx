"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import {
  actualizarGastoAction,
  crearGastoAction,
  type GastoFila,
  type GastoFormState,
} from "@/app/actions/gasto-actions";
import type { CategoriaGastoVista } from "@/app/actions/categoria-gasto-actions";
import { formatoDiaBogota } from "@/lib/fecha-bogota";
import { gastoInputSchema } from "@/lib/validation/gasto";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

type GastoFormInput = z.input<typeof gastoInputSchema>;
type GastoFormValues = z.output<typeof gastoInputSchema>;

const initialState: GastoFormState = { error: null, success: false };

interface GastoDialogProps {
  modo: "crear" | "editar";
  /** Gasto a editar (solo modo "editar"). */
  gasto?: GastoFila;
  /** Categorías activas; al editar se agrega la actual si está inactiva. */
  categorias: CategoriaGastoVista[];
  /** Sede preseleccionada (la del filtro de la página). */
  sedeIdPorDefecto: string;
  /** Solo ADMIN: habilita el selector de sede. */
  sedes?: { id: string; nombre: string }[];
}

function fechaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function GastoForm({
  modo,
  gasto,
  categorias,
  sedeIdPorDefecto,
  sedes,
  onGuardado,
}: GastoDialogProps & { onGuardado: () => void }) {
  const [state, setState] = useState<GastoFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<GastoFormInput, unknown, GastoFormValues>({
    resolver: zodResolver(gastoInputSchema),
    defaultValues: {
      categoriaId: gasto?.categoriaId ?? "",
      descripcion: gasto?.descripcion ?? "",
      monto: gasto ? String(gasto.monto) : "",
      fecha: gasto ? fechaIso(gasto.fecha) : formatoDiaBogota.format(new Date()),
      referencia: gasto?.referencia ?? "",
      sedeId: sedeIdPorDefecto,
    },
  });

  const opcionesCategoria = categorias.map((c) => ({ value: c.id, label: c.nombre }));
  if (gasto && !opcionesCategoria.some((o) => o.value === gasto.categoriaId)) {
    opcionesCategoria.push({ value: gasto.categoriaId, label: gasto.categoriaNombre });
  }

  function onValid(values: GastoFormValues) {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("categoriaId", values.categoriaId);
        formData.set("descripcion", values.descripcion);
        formData.set("monto", String(values.monto));
        formData.set("fecha", values.fecha);
        formData.set("referencia", values.referencia ?? "");
        if (sedes) formData.set("sedeId", values.sedeId ?? sedeIdPorDefecto);

        const result =
          modo === "editar" && gasto
            ? await actualizarGastoAction(gasto.id, initialState, formData)
            : await crearGastoAction(initialState, formData);
        if (result.success) {
          toast.success(modo === "editar" ? "Gasto actualizado" : "Gasto registrado");
          onGuardado();
        } else {
          setState(result);
        }
      } catch {
        toast.error("No se pudo guardar el gasto");
      }
    });
  }

  return (
    <form noValidate onSubmit={(evento) => handleSubmit(onValid)(evento)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gasto-categoria">Categoría</Label>
        <Controller
          control={control}
          name="categoriaId"
          render={({ field }) => (
            <SelectField
              id="gasto-categoria"
              items={opcionesCategoria}
              value={field.value}
              onValueChange={field.onChange}
              aria-invalid={errors.categoriaId ? true : undefined}
            />
          )}
        />
        {errors.categoriaId ? <p className="text-xs text-destructive">{errors.categoriaId.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gasto-descripcion">Descripción</Label>
        <Input
          id="gasto-descripcion"
          aria-invalid={errors.descripcion ? true : undefined}
          {...register("descripcion")}
        />
        {errors.descripcion ? <p className="text-xs text-destructive">{errors.descripcion.message}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gasto-monto">Monto</Label>
          <Input
            id="gasto-monto"
            type="number"
            min="1"
            step="1"
            className="font-mono"
            aria-invalid={errors.monto ? true : undefined}
            {...register("monto")}
          />
          {errors.monto ? <p className="text-xs text-destructive">{errors.monto.message}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gasto-fecha">Fecha</Label>
          <Input id="gasto-fecha" type="date" aria-invalid={errors.fecha ? true : undefined} {...register("fecha")} />
          {errors.fecha ? <p className="text-xs text-destructive">{errors.fecha.message}</p> : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gasto-referencia">Referencia (opcional)</Label>
        <Input
          id="gasto-referencia"
          aria-invalid={errors.referencia ? true : undefined}
          {...register("referencia")}
        />
        {errors.referencia ? <p className="text-xs text-destructive">{errors.referencia.message}</p> : null}
      </div>

      {sedes ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gasto-sede">Sede</Label>
          <Controller
            control={control}
            name="sedeId"
            render={({ field }) => (
              <SelectField
                id="gasto-sede"
                items={sedes.map((s) => ({ value: s.id, label: s.nombre }))}
                value={field.value ?? ""}
                onValueChange={field.onChange}
              />
            )}
          />
        </div>
      ) : null}

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : modo === "editar" ? "Guardar cambios" : "Registrar gasto"}
        </Button>
      </div>
    </form>
  );
}

export function GastoDialog(props: GastoDialogProps) {
  const [open, setOpen] = useState(false);
  const editando = props.modo === "editar";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={editando ? "ghost" : "default"} size={editando ? "sm" : "default"} />}>
        {editando ? "Editar" : "Nuevo gasto"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
          <DialogDescription>
            {editando ? "Corrige los datos del gasto." : "Registra un gasto operativo de la sede."}
          </DialogDescription>
        </DialogHeader>
        <GastoForm {...props} onGuardado={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
