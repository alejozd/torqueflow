"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import {
  actualizarServicioAction,
  crearServicioAction,
  type ServicioFormState,
  type ServicioVista,
} from "@/app/actions/servicio-actions";
import { servicioInputSchema } from "@/lib/validation/servicio";
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
import { Textarea } from "@/components/ui/textarea";

type ServicioFormInput = z.input<typeof servicioInputSchema>;
type ServicioFormValues = z.output<typeof servicioInputSchema>;

const initialState: ServicioFormState = { error: null, success: false };

interface ServicioDialogProps {
  modo: "crear" | "editar";
  /** Servicio a editar (solo modo "editar"). */
  servicio?: ServicioVista;
}

function ServicioForm({ modo, servicio, onGuardado }: ServicioDialogProps & { onGuardado: () => void }) {
  const [state, setState] = useState<ServicioFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ServicioFormInput, unknown, ServicioFormValues>({
    resolver: zodResolver(servicioInputSchema),
    defaultValues: {
      nombre: servicio?.nombre ?? "",
      descripcion: servicio?.descripcion ?? "",
      precioManoObra: servicio ? String(servicio.precioManoObra) : "",
    },
  });

  function onValid(values: ServicioFormValues) {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("nombre", values.nombre);
        formData.set("descripcion", values.descripcion ?? "");
        formData.set("precioManoObra", String(values.precioManoObra));

        const result =
          modo === "editar" && servicio
            ? await actualizarServicioAction(servicio.id, initialState, formData)
            : await crearServicioAction(initialState, formData);
        if (result.success) {
          toast.success(modo === "editar" ? "Servicio actualizado" : "Servicio creado");
          onGuardado();
        } else {
          setState(result);
        }
      } catch {
        toast.error("No se pudo guardar el servicio");
      }
    });
  }

  return (
    <form noValidate onSubmit={(evento) => handleSubmit(onValid)(evento)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="servicio-nombre">Nombre</Label>
        <Input
          id="servicio-nombre"
          aria-invalid={errors.nombre ? true : undefined}
          aria-describedby={errors.nombre ? "servicio-nombre-error" : undefined}
          {...register("nombre")}
        />
        {errors.nombre ? (
          <p id="servicio-nombre-error" className="text-xs text-destructive">
            {errors.nombre.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="servicio-descripcion">Descripción (opcional)</Label>
        <Textarea
          id="servicio-descripcion"
          rows={2}
          aria-invalid={errors.descripcion ? true : undefined}
          {...register("descripcion")}
        />
        {errors.descripcion ? <p className="text-xs text-destructive">{errors.descripcion.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="servicio-precio">Precio de mano de obra</Label>
        <Input
          id="servicio-precio"
          type="number"
          min="0"
          step="0.01"
          className="font-mono"
          aria-invalid={errors.precioManoObra ? true : undefined}
          aria-describedby={errors.precioManoObra ? "servicio-precio-error" : undefined}
          {...register("precioManoObra")}
        />
        {errors.precioManoObra ? (
          <p id="servicio-precio-error" className="text-xs text-destructive">
            {errors.precioManoObra.message}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Puede ser 0 si el servicio solo agrupa repuestos (kit sin mano de obra propia).
        </p>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : modo === "editar" ? "Guardar cambios" : "Crear servicio"}
        </Button>
      </div>
    </form>
  );
}

export function ServicioDialog(props: ServicioDialogProps) {
  const [open, setOpen] = useState(false);
  const editando = props.modo === "editar";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={editando ? "outline" : "default"} size="sm" />}>
        {editando ? "Editar" : "Nuevo servicio"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
          <DialogDescription>
            {editando
              ? "Corrige el nombre, la descripción o el precio base de mano de obra."
              : "El precio de mano de obra es la base; los repuestos del kit se agregan después."}
          </DialogDescription>
        </DialogHeader>
        <ServicioForm {...props} onGuardado={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
