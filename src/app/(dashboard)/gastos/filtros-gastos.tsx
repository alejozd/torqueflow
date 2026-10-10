"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const TODAS = "";

export function FiltrosGastos({
  periodo,
  sedeId,
  categoriaId,
  sedes,
  categorias,
}: {
  periodo: string;
  sedeId: string;
  categoriaId: string;
  /** Solo ADMIN. */
  sedes?: { id: string; nombre: string }[];
  categorias: { id: string; nombre: string }[];
}) {
  return (
    <form method="get" action="/gastos" className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="periodo">Mes</Label>
        <Input id="periodo" name="periodo" type="month" defaultValue={periodo} required />
      </div>

      {sedes ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sedeId">Sede</Label>
          <SelectField
            id="sedeId"
            name="sedeId"
            defaultValue={sedeId}
            items={sedes.map((s) => ({ value: s.id, label: s.nombre }))}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="categoriaId">Categoría</Label>
        <SelectField
          id="categoriaId"
          name="categoriaId"
          defaultValue={categoriaId || TODAS}
          items={[{ value: TODAS, label: "Todas" }, ...categorias.map((c) => ({ value: c.id, label: c.nombre }))]}
        />
      </div>

      <Button type="submit">Aplicar</Button>
    </form>
  );
}
