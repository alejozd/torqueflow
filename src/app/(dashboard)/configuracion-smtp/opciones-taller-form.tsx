"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { guardarOpcionesTallerAction, type ConfiguracionTallerFormState } from "@/app/actions/configuracion-taller-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { OpcionesTaller } from "@/lib/configuracion/opciones-taller";

const initialState: ConfiguracionTallerFormState = { error: null, success: false };

const OPCIONES: { nombre: keyof OpcionesTaller; etiqueta: string; ayuda: string }[] = [
  {
    nombre: "exigirActaFirmada",
    etiqueta: "Exigir acta firmada al entregar",
    ayuda:
      "Encendida, una orden solo se entrega con la firma de quien recibe (en pantalla o foto del acta en papel). " +
      "Apagada, se puede entregar sin firma, con una confirmación, y firmar el acta después si se quiere.",
  },
  {
    nombre: "usarControlCaja",
    etiqueta: "Usar control de caja",
    ayuda:
      "Encendida, hay que abrir la caja de la sede para registrar dinero en efectivo y así cuadrarla al cierre. " +
      "Solo los cobros y pagos en efectivo la exigen: tarjeta y transferencia nunca. Apagada, nada pide abrir la caja.",
  },
];

/**
 * Fase de consolidación (D1, D3): cómo trabaja el taller. Interruptores hechos
 * con un checkbox nativo, como el de "Enviar recordatorios" del formulario SMTP
 * (no hay un componente Switch en el proyecto). Marcado envía "true"; desmarcado
 * no viaja, y la acción lo lee como apagado.
 */
export function OpcionesTallerForm({ opciones }: { opciones: OpcionesTaller }) {
  const [state, formAction, isPending] = useActionState(guardarOpcionesTallerAction, initialState);

  useEffect(() => {
    if (state.success) toast.success("Configuración guardada");
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {OPCIONES.map((opcion) => (
        <div key={opcion.nombre} className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-4">
          <label
            htmlFor={opcion.nombre}
            className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center"
          >
            <input
              id={opcion.nombre}
              name={opcion.nombre}
              type="checkbox"
              value="true"
              defaultChecked={opciones[opcion.nombre]}
              className="peer sr-only"
            />
            <span className="absolute inset-0 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary" />
            <span className="absolute left-1 size-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
          </label>
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={opcion.nombre}>{opcion.etiqueta}</Label>
            <p className="text-xs text-muted-foreground">{opcion.ayuda}</p>
          </div>
        </div>
      ))}
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      <div>
        <Button type="submit" disabled={isPending}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
