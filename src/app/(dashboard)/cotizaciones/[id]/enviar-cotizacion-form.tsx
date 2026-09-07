"use client";

import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { enviarCotizacionAction, type EnviarCotizacionFormState } from "@/app/actions/cotizacion-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const initialState: EnviarCotizacionFormState = { error: null, success: false };

type Canal = "EMAIL" | "WHATSAPP" | "OTRO";

const CANAL_OPTIONS = [
  { value: "EMAIL", label: "Correo electrónico" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "OTRO", label: "Otro" },
];

// Addresses the user's own confusion about what each canal actually does --
// EMAIL now really sends, WHATSAPP only opens a prefilled wa.me link, OTRO is
// a manual "I already shared this elsewhere" record.
const CANAL_CAPTIONS: Record<Canal, string> = {
  EMAIL: "Se enviará un correo real al cliente.",
  WHATSAPP: "Se abrirá WhatsApp con un mensaje prellenado — no requiere API de WhatsApp.",
  OTRO: "Solo registra que ya la compartiste por otro medio (en persona, llamada, etc.) — no se envía nada automáticamente.",
};

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function EnviarCotizacionForm({
  cotizacionId,
  cliente,
  resumen,
}: {
  cotizacionId: string;
  cliente: { nombre: string; telefono: string | null };
  resumen: { numero: number; placa: string; total: number };
}) {
  const enviar = enviarCotizacionAction.bind(null, cotizacionId);
  const [state, formAction, isPending] = useActionState(enviar, initialState);
  const [canal, setCanal] = useState<Canal>("EMAIL");
  const [clientError, setClientError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError(null);

    const formData = new FormData(formRef.current!);
    // canal is Select-controlled (react state), not a registered native
    // <select name="canal"> -- it never lands in FormData on its own.
    formData.set("canal", canal);

    if (canal === "WHATSAPP") {
      if (!cliente.telefono) {
        setClientError("Este cliente no tiene teléfono registrado.");
        return;
      }
      const digitos = cliente.telefono.replace(/\D/g, "");
      // Colombian mobile without country code is 10 digits -- this app is
      // Colombia-only per its es-CO/COP formatting everywhere. Anything else
      // is assumed to already carry a country code.
      const numeroNormalizado = digitos.length === 10 ? `57${digitos}` : digitos;
      const mensaje =
        `Hola ${cliente.nombre}, te compartimos la cotización #${resumen.numero} para tu vehículo ${resumen.placa}. ` +
        `Total: ${formatoMoneda.format(resumen.total)}. Cualquier duda, contáctanos.`;
      // Must run synchronously, before any startTransition/await -- Chrome's
      // popup blocker silently swallows window.open calls made after an
      // async gap.
      window.open(`https://wa.me/${numeroNormalizado}?text=${encodeURIComponent(mensaje)}`, "_blank");
    }

    startTransition(() => formAction(formData));
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="canal">Canal de envío</Label>
        <SelectField
          id="canal"
          items={CANAL_OPTIONS}
          value={canal}
          onValueChange={(value) => setCanal(value as Canal)}
          placeholder="Selecciona un canal"
        />
        <p className="text-xs text-muted-foreground">{CANAL_CAPTIONS[canal]}</p>
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

      {clientError ? (
        <Alert variant="destructive">
          <AlertDescription>{clientError}</AlertDescription>
        </Alert>
      ) : null}

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
