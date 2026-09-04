"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { useController } from "react-hook-form";
import type { Control, FieldErrors, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { Plus } from "lucide-react";
import { vehiculoInputSchema } from "@/lib/validation/vehiculo";
import type { MarcaVehiculo, ModeloVehiculo } from "@/generated/prisma-tenant";
import { NuevaMarcaDialog } from "./nueva-marca-dialog";
import { NuevoModeloDialog } from "./nuevo-modelo-dialog";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { FormGroup } from "@/components/form-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";

// createVehiculoAction/updateVehiculoAction read these fields with `|| undefined`
// before parsing -- an untouched input submits "", which .optional() alone does
// not treat as absent. Mirrored here so a blank optional field does not
// spuriously fail validation client-side the way it never does server-side.
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
export const vehiculoFormSchema = vehiculoInputSchema.extend({
  anio: z.preprocess(blankToUndefined, vehiculoInputSchema.shape.anio),
  combustible: z.preprocess(blankToUndefined, vehiculoInputSchema.shape.combustible),
  kilometraje: z.preprocess(blankToUndefined, vehiculoInputSchema.shape.kilometraje),
  proximoMantenimiento: z.preprocess(blankToUndefined, vehiculoInputSchema.shape.proximoMantenimiento),
  transmision: z.preprocess(blankToUndefined, vehiculoInputSchema.shape.transmision),
});
export type VehiculoFormInput = z.input<typeof vehiculoFormSchema>;

// Shared by NuevoVehiculoForm and EditarVehiculoForm -- both need the exact
// same 9-field, 4-group layout, only the submit action and defaultValues differ.
export function VehiculoFormFields({
  register,
  errors,
  control,
  setValue,
  marcas,
  modelos,
  esAdmin,
}: {
  register: UseFormRegister<VehiculoFormInput>;
  errors: FieldErrors<VehiculoFormInput>;
  control: Control<VehiculoFormInput>;
  setValue: UseFormSetValue<VehiculoFormInput>;
  marcas: MarcaVehiculo[];
  modelos: ModeloVehiculo[];
  esAdmin: boolean;
}) {
  const { field: combustibleField } = useController({ name: "combustible", control });
  const { field: transmisionField } = useController({ name: "transmision", control });
  const { field: marcaIdField } = useController({ name: "marcaId", control });
  const { field: modeloIdField } = useController({ name: "modeloId", control });

  const [marcasLocal, setMarcasLocal] = useState(marcas);
  const [modelosLocal, setModelosLocal] = useState(modelos);
  const [crearMarcaOpen, setCrearMarcaOpen] = useState(false);
  const [crearModeloOpen, setCrearModeloOpen] = useState(false);

  const marcaSeleccionada = marcasLocal.find((marca) => marca.id === marcaIdField.value) ?? null;

  const marcaOptions: ComboboxOption[] = useMemo(
    () => marcasLocal.map((marca) => ({ value: marca.id, label: marca.nombre })),
    [marcasLocal],
  );
  const modeloOptions: ComboboxOption[] = useMemo(
    () =>
      modelosLocal
        .filter((modelo) => modelo.marcaId === marcaIdField.value)
        .map((modelo) => ({ value: modelo.id, label: modelo.nombre })),
    [modelosLocal, marcaIdField.value],
  );

  const marcaRegister = register("marca");
  const modeloRegister = register("modelo");

  // Takes the object directly (not just an id) so a freshly created
  // marca/modelo -- not yet in marcasLocal/modelosLocal's state at the point
  // its own onCreated callback fires -- can still be applied without relying
  // on a lookup against state that hasn't re-rendered yet.
  function aplicarMarca(marca: MarcaVehiculo) {
    marcaIdField.onChange(marca.id);
    setValue("marca", marca.nombre, { shouldValidate: true });
    // A different marca invalidates whatever modelo was picked -- it almost
    // certainly doesn't belong to the new marca's catalog.
    modeloIdField.onChange("");
    setValue("modelo", "", { shouldValidate: true });
  }

  function aplicarModelo(modelo: ModeloVehiculo) {
    modeloIdField.onChange(modelo.id);
    setValue("modelo", modelo.nombre, { shouldValidate: true });
  }

  function seleccionarMarca(marcaId: string) {
    const marca = marcasLocal.find((m) => m.id === marcaId);
    if (marca) aplicarMarca(marca);
  }

  function seleccionarModelo(modeloId: string) {
    const modelo = modelosLocal.find((m) => m.id === modeloId);
    if (modelo) aplicarModelo(modelo);
  }

  return (
    <>
      <FormGroup label="Identificación">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="placa">Placa</Label>
            <Input
              id="placa"
              className="font-mono"
              aria-invalid={errors.placa ? true : undefined}
              aria-describedby={errors.placa ? "placa-error" : undefined}
              {...register("placa")}
            />
            {errors.placa ? <p id="placa-error">{errors.placa.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Vehículo">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="marca">Marca</Label>
            <Input
              id="marca"
              aria-invalid={errors.marca ? true : undefined}
              aria-describedby={errors.marca ? "marca-error" : undefined}
              {...marcaRegister}
              onChange={(event) => {
                marcaRegister.onChange(event);
                // Hand-editing the text after a catalog pick means it no
                // longer necessarily matches marcaId's row -- drop the
                // reference rather than submit a mismatched one.
                if (marcaIdField.value) marcaIdField.onChange("");
              }}
            />
            {errors.marca ? <p id="marca-error">{errors.marca.message}</p> : null}
            <div className="flex items-center gap-1.5">
              <Combobox
                items={marcaOptions}
                value={marcaIdField.value ?? ""}
                onValueChange={seleccionarMarca}
                placeholder="Buscar en catálogo…"
                emptyMessage="Ninguna marca coincide"
                className="h-8 text-xs"
              />
              {esAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  title="Agregar marca"
                  onClick={() => setCrearMarcaOpen(true)}
                >
                  <Plus className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="modelo">Modelo</Label>
            <Input
              id="modelo"
              aria-invalid={errors.modelo ? true : undefined}
              aria-describedby={errors.modelo ? "modelo-error" : undefined}
              {...modeloRegister}
              onChange={(event) => {
                modeloRegister.onChange(event);
                if (modeloIdField.value) modeloIdField.onChange("");
              }}
            />
            {errors.modelo ? <p id="modelo-error">{errors.modelo.message}</p> : null}
            <div className="flex items-center gap-1.5">
              <Combobox
                items={modeloOptions}
                value={modeloIdField.value ?? ""}
                onValueChange={seleccionarModelo}
                placeholder={marcaIdField.value ? "Buscar en catálogo…" : "Elige una marca primero"}
                emptyMessage="Ningún modelo coincide"
                disabled={!marcaIdField.value}
                className="h-8 text-xs"
              />
              {esAdmin && marcaIdField.value ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  title="Agregar modelo"
                  onClick={() => setCrearModeloOpen(true)}
                >
                  <Plus className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <Label htmlFor="color">Color</Label>
            <Input
              id="color"
              aria-invalid={errors.color ? true : undefined}
              aria-describedby={errors.color ? "color-error" : undefined}
              {...register("color")}
            />
            {errors.color ? <p id="color-error">{errors.color.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <Label htmlFor="anio">Año</Label>
            <Input
              id="anio"
              type="number"
              min="1900"
              max="2100"
              className="font-mono"
              aria-invalid={errors.anio ? true : undefined}
              aria-describedby={errors.anio ? "anio-error" : undefined}
              {...register("anio")}
            />
            {errors.anio ? <p id="anio-error">{errors.anio.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <Label htmlFor="combustible">Combustible</Label>
            <SelectField
              id="combustible"
              value={(combustibleField.value as string | undefined) ?? ""}
              onValueChange={combustibleField.onChange}
              placeholder="Seleccionar..."
              items={[
                { value: "", label: "Seleccionar..." },
                { value: "GASOLINA", label: "Gasolina" },
                { value: "DIESEL", label: "Diésel" },
                { value: "HIBRIDO", label: "Híbrido" },
                { value: "ELECTRICO", label: "Eléctrico" },
              ]}
            />
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Estado actual">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="kilometraje">Kilometraje</Label>
            <Input
              id="kilometraje"
              type="number"
              min="0"
              className="font-mono"
              aria-invalid={errors.kilometraje ? true : undefined}
              aria-describedby={errors.kilometraje ? "kilometraje-error" : undefined}
              {...register("kilometraje")}
            />
            {errors.kilometraje ? <p id="kilometraje-error">{errors.kilometraje.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="proximoMantenimiento">Próximo mantenimiento</Label>
            <Input
              id="proximoMantenimiento"
              type="date"
              aria-invalid={errors.proximoMantenimiento ? true : undefined}
              aria-describedby={errors.proximoMantenimiento ? "proximoMantenimiento-error" : undefined}
              {...register("proximoMantenimiento")}
            />
            {errors.proximoMantenimiento ? (
              <p id="proximoMantenimiento-error">{errors.proximoMantenimiento.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="transmision">Transmisión</Label>
            <SelectField
              id="transmision"
              value={(transmisionField.value as string | undefined) ?? ""}
              onValueChange={transmisionField.onChange}
              placeholder="Seleccionar..."
              items={[
                { value: "", label: "Seleccionar..." },
                { value: "AUTOMATICA", label: "Automática" },
                { value: "MECANICA", label: "Mecánica" },
              ]}
            />
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Notas">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="observaciones">Observaciones del vehículo</Label>
          <Textarea
            id="observaciones"
            rows={3}
            placeholder="Rines de posventa, llave de repuesto en recepción…"
            {...register("observaciones")}
          />
        </div>
      </FormGroup>

      <NuevaMarcaDialog
        open={crearMarcaOpen}
        onOpenChange={setCrearMarcaOpen}
        onCreated={(marca) => {
          setMarcasLocal((prev) => [...prev, marca].sort((a, b) => a.nombre.localeCompare(b.nombre)));
          aplicarMarca(marca);
          setCrearMarcaOpen(false);
        }}
      />

      {marcaSeleccionada ? (
        <NuevoModeloDialog
          open={crearModeloOpen}
          onOpenChange={setCrearModeloOpen}
          marcaId={marcaSeleccionada.id}
          marcaNombre={marcaSeleccionada.nombre}
          onCreated={(modelo) => {
            setModelosLocal((prev) => [...prev, modelo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            aplicarModelo(modelo);
            setCrearModeloOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
