"use client";

import { Button } from "@/components/ui/button";
import { CampoMes } from "@/components/campo-mes";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

export function FiltrosCaja({
  periodo,
  sedeId,
  sedes,
}: {
  periodo: string;
  sedeId: string;
  /** Solo ADMIN. */
  sedes?: { id: string; nombre: string }[];
}) {
  return (
    <form method="get" action="/caja" className="flex flex-wrap items-end gap-4">
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
        <Label htmlFor="periodo">Mes del historial</Label>
        <CampoMes id="periodo" name="periodo" defaultValue={periodo} />
      </div>
      <Button type="submit">Aplicar</Button>
    </form>
  );
}
