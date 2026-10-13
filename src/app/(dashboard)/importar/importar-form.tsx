"use client";

import { useActionState } from "react";
import { importarAction } from "@/app/actions/importacion-actions";
import { resultadoVacio } from "@/lib/importacion/resultado";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { ReporteImportacion } from "./reporte-importacion";

const SIN_PROVEEDOR: SelectFieldOption = { value: "", label: "Sin proveedor (no hay stock inicial)" };

/**
 * Formulario de importación: el archivo, la bodega donde entran los repuestos y
 * el proveedor que respalda la entrada de mercancía del stock inicial. El
 * reporte aparece debajo, con lo que entró y lo que quedó por fuera.
 */
export function ImportarForm({
  bodegas,
  proveedores,
  esAdmin,
}: {
  bodegas: SelectFieldOption[];
  proveedores: SelectFieldOption[];
  esAdmin: boolean;
}) {
  const [state, formAction, isPending] = useActionState(importarAction, resultadoVacio());

  return (
    <div className="flex flex-col gap-6">
      <form noValidate action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="archivo">Archivo de Excel (.xlsx)</Label>
          <Input id="archivo" name="archivo" type="file" accept=".xlsx" required className="max-w-md" />
          <p className="text-xs text-muted-foreground">
            Descarga la plantilla, llena las hojas que necesites y súbela aquí. Nada se sobrescribe: lo que ya exista se
            te informa y se deja como está.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bodegaId">Bodega de los repuestos</Label>
            <SelectField id="bodegaId" name="bodegaId" items={bodegas} placeholder="Elige la bodega" required />
            <p className="text-xs text-muted-foreground">Obligatoria si el archivo trae la hoja de Repuestos.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proveedorId">Proveedor del stock inicial</Label>
            <SelectField
              id="proveedorId"
              name="proveedorId"
              items={[SIN_PROVEEDOR, ...proveedores]}
              defaultValue=""
            />
            <p className="text-xs text-muted-foreground">
              Solo hace falta si la hoja de Repuestos trae cantidad inicial: queda registrada como entrada de mercancía.
            </p>
          </div>
        </div>

        {!esAdmin ? (
          <Alert>
            <AlertDescription>
              La hoja de Servicios solo la puede importar un administrador; si tu archivo la trae, se omitirá.
            </AlertDescription>
          </Alert>
        ) : null}

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}

        <div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Importando..." : "Importar"}
          </Button>
        </div>
      </form>

      {state.resumen.length > 0 ? <ReporteImportacion resultado={state} /> : null}
    </div>
  );
}
