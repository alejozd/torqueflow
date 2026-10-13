"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  guardarEsquemaLiquidacionAction,
  quitarEsquemaLiquidacionAction,
  type EsquemaLiquidacionFormState,
  type TecnicoConEsquema,
} from "@/app/actions/liquidacion-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const initialState: EsquemaLiquidacionFormState = { error: null, success: false };
const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });
const formatoPorcentaje = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const TIPOS = [
  { value: "PORCENTAJE", label: "Porcentaje de la mano de obra" },
  { value: "FIJO", label: "Base fija por periodo" },
  { value: "MIXTO", label: "Base fija + porcentaje" },
];

/** Cómo se le paga a un técnico, en una línea. */
export function descripcionEsquema(tecnico: TecnicoConEsquema): string {
  if (!tecnico.tipo) return "Sin esquema (no se liquida)";
  const porcentaje = `${formatoPorcentaje.format(tecnico.porcentaje ?? 0)} % de la mano de obra`;
  const base = formatoMoneda.format(tecnico.montoFijo ?? 0);
  if (tecnico.tipo === "PORCENTAJE") return porcentaje;
  if (tecnico.tipo === "FIJO") return `Base fija de ${base}`;
  return `Base de ${base} + ${porcentaje}`;
}

function FormularioEsquema({ tecnico, onGuardado }: { tecnico: TecnicoConEsquema; onGuardado: () => void }) {
  const [tipo, setTipo] = useState(tecnico.tipo ?? "PORCENTAJE");
  const [porcentaje, setPorcentaje] = useState(tecnico.porcentaje === null ? "" : String(tecnico.porcentaje));
  const [montoFijo, setMontoFijo] = useState(tecnico.montoFijo === null ? "" : String(tecnico.montoFijo));
  const [state, setState] = useState<EsquemaLiquidacionFormState>(initialState);
  const [isPending, startTransition] = useTransition();

  const usaPorcentaje = tipo !== "FIJO";
  const usaBase = tipo !== "PORCENTAJE";

  function guardar() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("tipo", tipo);
        formData.set("porcentaje", usaPorcentaje ? porcentaje : "");
        formData.set("montoFijo", usaBase ? montoFijo : "");

        const result = await guardarEsquemaLiquidacionAction(tecnico.usuarioId, initialState, formData);
        if (result.success) {
          toast.success(`Esquema de ${tecnico.nombre} guardado`);
          onGuardado();
        } else {
          setState(result);
        }
      } catch {
        toast.error("No se pudo guardar el esquema");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`tipo-${tecnico.usuarioId}`}>Tipo</Label>
          <SelectField
            id={`tipo-${tecnico.usuarioId}`}
            items={TIPOS}
            value={tipo}
            onValueChange={(valor) => setTipo(valor as typeof tipo)}
          />
        </div>
        {usaPorcentaje ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`porcentaje-${tecnico.usuarioId}`}>Porcentaje de la mano de obra</Label>
            <Input
              id={`porcentaje-${tecnico.usuarioId}`}
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="font-mono"
              value={porcentaje}
              onChange={(evento) => setPorcentaje(evento.target.value)}
            />
          </div>
        ) : null}
        {usaBase ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`monto-${tecnico.usuarioId}`}>Base por periodo</Label>
            <Input
              id={`monto-${tecnico.usuarioId}`}
              type="number"
              min="1"
              step="1"
              className="font-mono"
              value={montoFijo}
              onChange={(evento) => setMontoFijo(evento.target.value)}
            />
          </div>
        ) : null}
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onGuardado}>
          Cancelar
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={guardar}>
          {isPending ? "Guardando..." : "Guardar esquema"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Forma de pago de cada técnico de la sede activa (D4). Un técnico sin esquema
 * aparece marcado: no se liquida hasta que se le defina uno.
 */
export function EsquemaLiquidacionSection({ tecnicos }: { tecnicos: TecnicoConEsquema[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function quitar(usuarioId: string) {
    startTransition(async () => {
      try {
        const result = await quitarEsquemaLiquidacionAction(usuarioId);
        if (result.error) {
          setError(result.error);
          return;
        }
        setError(null);
        setQuitando(null);
        toast.success("Esquema quitado: ese técnico ya no se liquida");
      } catch {
        toast.error("No se pudo quitar el esquema");
      }
    });
  }

  if (tecnicos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta sede no tiene técnicos. Los usuarios con rol Técnico aparecen aquí para definirles su forma de pago.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {tecnicos.map((tecnico) => (
          <li key={tecnico.usuarioId} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <span className="font-medium">{tecnico.nombre}</span>
              <span
                className={
                  tecnico.tipo
                    ? "ml-auto text-xs text-muted-foreground"
                    : "ml-auto text-xs font-medium text-destructive"
                }
              >
                {descripcionEsquema(tecnico)}
              </span>
              {quitando === tecnico.usuarioId ? (
                <ConfirmacionEnLinea
                  pregunta="¿Dejar a este técnico sin esquema?"
                  etiquetaConfirmar="Quitar"
                  pendiente={isPending}
                  onCancelar={() => setQuitando(null)}
                  onConfirmar={() => quitar(tecnico.usuarioId)}
                />
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditando(editando === tecnico.usuarioId ? null : tecnico.usuarioId)}
                  >
                    {editando === tecnico.usuarioId ? "Cerrar" : tecnico.tipo ? "Editar" : "Definir esquema"}
                  </Button>
                  {tecnico.tipo ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setQuitando(tecnico.usuarioId)}>
                      Quitar esquema
                    </Button>
                  ) : null}
                </>
              )}
            </div>
            {editando === tecnico.usuarioId ? (
              <FormularioEsquema tecnico={tecnico} onGuardado={() => setEditando(null)} />
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
