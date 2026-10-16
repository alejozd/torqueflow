"use client";

import { useActionState, useState } from "react";
import { agregarGarantiaAction, quitarGarantiaAction, type RecepcionFormState } from "@/app/actions/recepcion-actions";
import { QuitarConConfirmacion } from "@/components/quitar-con-confirmacion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CampoFecha } from "@/components/campo-fecha";
import { formatoDiaBogota } from "@/lib/fecha-bogota";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { coberturaDe } from "@/lib/garantias/cobertura";
import type { TipoGarantia } from "@/generated/prisma-tenant";

const initialState: RecepcionFormState = { error: null, success: false };

const TIPOS: { value: TipoGarantia; label: string }[] = [
  { value: "TRABAJO", label: "Trabajo de mano de obra" },
  { value: "REPUESTO", label: "Repuesto" },
];

export interface LineaCubrible {
  id: string;
  descripcion: string;
}

export interface GarantiaVista {
  id: string;
  tipo: TipoGarantia;
  descripcion: string;
  linea: string | null;
  cubreHasta: Date | null;
  cubreHastaKm: number | null;
  nota: string | null;
}


/**
 * Garantías de la orden (D3/D12): se registran mientras la orden es editable y se
 * consultan en la ficha del vehículo. No hay avisos automáticos en esta fase.
 */
export function GarantiasSection({
  ordenId,
  garantias,
  lineasTrabajo,
  lineasRepuesto,
  soloLectura,
  puedeQuitar,
}: {
  ordenId: string;
  garantias: GarantiaVista[];
  lineasTrabajo: LineaCubrible[];
  lineasRepuesto: LineaCubrible[];
  soloLectura: boolean;
  puedeQuitar: boolean;
}) {
  const agregar = agregarGarantiaAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(agregar, initialState);
  const [tipo, setTipo] = useState<TipoGarantia>("TRABAJO");
  const [lineaId, setLineaId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cubreHasta, setCubreHasta] = useState("");
  const [cubreHastaKm, setCubreHastaKm] = useState("");
  const [nota, setNota] = useState("");

  const lineas = tipo === "TRABAJO" ? lineasTrabajo : lineasRepuesto;

  return (
    <div className="flex flex-col gap-4">
      {garantias.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin garantías registradas.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {garantias.map((garantia) => (
            <li key={garantia.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span className="font-medium">{garantia.descripcion}</span>
              <span className="text-xs text-muted-foreground">
                {garantia.tipo === "TRABAJO" ? "Trabajo" : "Repuesto"}
                {garantia.linea ? ` · ${garantia.linea}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">· {coberturaDe(garantia)}</span>
              {garantia.nota ? <span className="text-xs text-muted-foreground">· {garantia.nota}</span> : null}
              {puedeQuitar && !soloLectura ? (
                <span className="ml-auto">
                  <QuitarConConfirmacion
                    etiqueta={`Quitar garantía de ${garantia.descripcion}`}
                    pregunta={`¿Quitar la garantía "${garantia.descripcion}"?`}
                    accion={quitarGarantiaAction.bind(null, garantia.id)}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {soloLectura ? null : lineas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {tipo === "TRABAJO"
            ? "La orden no tiene líneas de mano de obra todavía."
            : "La orden no tiene repuestos todavía."}
        </p>
      ) : (
        <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
          <input type="hidden" name="tipo" value={tipo} />
          <div className="flex min-w-48 flex-col gap-1.5">
            <Label htmlFor="garantia-tipo">Cubre</Label>
            <SelectField
              id="garantia-tipo"
              items={TIPOS}
              value={tipo}
              onValueChange={(valor) => {
                setTipo(valor as TipoGarantia);
                setLineaId("");
              }}
            />
          </div>
          <div className="flex min-w-56 flex-col gap-1.5">
            <Label htmlFor="garantia-linea">{tipo === "TRABAJO" ? "Trabajo" : "Repuesto"}</Label>
            <SelectField
              id="garantia-linea"
              items={lineas.map((linea) => ({ value: linea.id, label: linea.descripcion }))}
              value={lineaId}
              onValueChange={setLineaId}
              placeholder="Elige la línea"
            />
          </div>
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Label htmlFor="garantia-descripcion">Qué cubre</Label>
            <Input
              id="garantia-descripcion"
              value={descripcion}
              maxLength={200}
              onChange={(evento) => setDescripcion(evento.target.value)}
              placeholder="Cambio de aceite"
            />
          </div>
          <div className="flex min-w-52 flex-col gap-1.5">
            <Label htmlFor="garantia-fecha">Hasta (fecha)</Label>
            <CampoFecha
              id="garantia-fecha"
              tipo="garantia"
              min={formatoDiaBogota.format(new Date())}
              value={cubreHasta}
              onChange={setCubreHasta}
              className="w-full"
            />
          </div>
          <div className="flex w-36 flex-col gap-1.5">
            <Label htmlFor="garantia-km">Hasta (km)</Label>
            <Input
              id="garantia-km"
              type="number"
              min={0}
              value={cubreHastaKm}
              onChange={(evento) => setCubreHastaKm(evento.target.value)}
              placeholder="95000"
            />
          </div>
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <Label htmlFor="garantia-nota">Nota (opcional)</Label>
            <Textarea
              id="garantia-nota"
              rows={1}
              maxLength={300}
              value={nota}
              onChange={(evento) => setNota(evento.target.value)}
            />
          </div>
          <input type="hidden" name={tipo === "TRABAJO" ? "manoDeObraId" : "itemOrdenId"} value={lineaId} />
          <input type="hidden" name="descripcion" value={descripcion} />
          <input type="hidden" name="cubreHasta" value={cubreHasta} />
          <input type="hidden" name="cubreHastaKm" value={cubreHastaKm} />
          <input type="hidden" name="nota" value={nota} />
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Registrando..." : "Registrar garantía"}
          </Button>
        </form>
      )}

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <p role="status" className="text-xs text-muted-foreground">
          Garantía registrada.
        </p>
      ) : null}
    </div>
  );
}
