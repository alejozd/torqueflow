"use client";

import { useActionState } from "react";
import { enviarCotizacionAction, type EnviarCotizacionFormState } from "@/app/actions/cotizacion-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const initialState: EnviarCotizacionFormState = { error: null, success: false };

const CANAL_OPTIONS = [
  { value: "EMAIL", label: "Correo electrónico" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "OTRO", label: "Otro" },
];

export function EnviarCotizacionForm({ cotizacionId }: { cotizacionId: string }) {
  const enviar = enviarCotizacionAction.bind(null, cotizacionId);
  const [state, formAction, isPending] = useActionState(enviar, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="canal">Canal de envío</Label>
        <SelectField id="canal" name="canal" items={CANAL_OPTIONS} defaultValue="EMAIL" placeholder="Selecciona un canal" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vigenciaDias">Vigencia (días)</Label>
        <Input id="vigenciaDias" name="vigenciaDias" type="number" min="1" step="1" defaultValue={8} className="font-mono" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notas">Notas (opcional)</Label>
        <Textarea id="notas" name="notas" rows={2} placeholder="Precios sujetos a disponibilidad de repuestos" />
      </div>

      <Button type="submit" disabled={isPending} className="self-end">
        {isPending ? "Enviando..." : "Enviar al cliente"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
