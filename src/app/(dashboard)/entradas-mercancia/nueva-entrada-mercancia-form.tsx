"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createEntradaMercanciaAction, type EntradaFormState } from "@/app/actions/entrada-mercancia-actions";
import { entradaMercanciaInputSchema, type EntradaMercanciaInput } from "@/lib/validation/inventario";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const initialState: EntradaFormState = { error: null, success: false, entradaId: null };

export function NuevaEntradaMercanciaForm({
  proveedores,
  bodegas,
}: {
  proveedores: Proveedor[];
  bodegas: Bodega[];
}) {
  const router = useRouter();
  const [state, setState] = useState<EntradaFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<EntradaMercanciaInput>({
    resolver: zodResolver(entradaMercanciaInputSchema),
    defaultValues: { proveedorId: "", bodegaId: "" },
  });
  const { field: proveedorIdField } = useController({ name: "proveedorId", control });
  const { field: bodegaIdField } = useController({ name: "bodegaId", control });

  const proveedorOptions: ComboboxOption[] = useMemo(
    () => proveedores.map((proveedor) => ({ value: proveedor.id, label: proveedor.nombre })),
    [proveedores],
  );

  function onValid(data: { proveedorId?: string; bodegaId?: string }) {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      // proveedorId and bodegaId are Combobox/SelectField
      // (react-hook-form-controlled, not native <select name="..."> register())
      // -- they don't populate FormData on their own, so they must be set
      // explicitly here.
      formData.set("proveedorId", data.proveedorId ?? "");
      formData.set("bodegaId", data.bodegaId ?? "");
      const result = await createEntradaMercanciaAction(initialState, formData);
      if (result.success && result.entradaId) {
        toast.success("Entrada creada");
        // Straight to the entrada's own page -- that's where ítems get
        // registered (and stock actually moves), so a bare "Entrada creada"
        // message here would just be a dead end the user has to click out of.
        router.push(`/entradas-mercancia/${result.entradaId}`);
      } else {
        toast.error(result.error ?? "No se pudo crear la entrada");
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <FormGroup label="Encabezado">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proveedorId">Proveedor</Label>
            <Combobox
              id="proveedorId"
              required
              items={proveedorOptions}
              value={proveedorIdField.value ?? ""}
              onValueChange={proveedorIdField.onChange}
              placeholder="Buscar proveedor..."
              emptyMessage="Ningún proveedor coincide"
              aria-invalid={errors.proveedorId ? true : undefined}
              aria-describedby={errors.proveedorId ? "proveedorId-error" : undefined}
            />
            {errors.proveedorId ? <p id="proveedorId-error">{errors.proveedorId.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bodegaId">Bodega</Label>
            <SelectField
              id="bodegaId"
              required
              aria-invalid={errors.bodegaId ? true : undefined}
              aria-describedby={errors.bodegaId ? "bodegaId-error" : undefined}
              value={bodegaIdField.value ?? ""}
              onValueChange={bodegaIdField.onChange}
              placeholder="Selecciona una bodega"
              items={bodegas.map((bodega) => ({ value: bodega.id, label: bodega.nombre }))}
            />
            {errors.bodegaId ? <p id="bodegaId-error">{errors.bodegaId.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2">
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancelar
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creando..." : "Crear entrada"}
        </Button>
      </div>
    </form>
  );
}
