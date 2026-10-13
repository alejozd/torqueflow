"use client";

import { useActionState, useState, type FormEvent } from "react";
import {
  entregarOrdenAction,
  firmarActaAction,
  guardarActaAction,
  type ActaFormState,
} from "@/app/actions/recepcion-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { FirmaCanvas } from "./firma-canvas";

const initialState: ActaFormState = { error: null, success: false };

export interface ActaVista {
  recibidoPor: string;
  documentoRecibe: string | null;
  observaciones: string | null;
  firmaUrl: string | null;
  firmaFotoUrl: string | null;
  firmadaAt: Date | null;
}

type Accion = "borrador" | "entregar" | "firmar";

/**
 * Acta de entrega (D4/D5/D6): los datos de quien recibe, la firma (en pantalla o
 * foto del papel) y los tres desenlaces posibles:
 *
 * - `borrador`: guarda los datos sin firmar (la orden sigue abierta),
 * - `entregar`: firma y pasa la orden a ENTREGADA en una sola operación,
 * - `firmar`: la orden ya se entregó y el cliente firma más tarde.
 *
 * Un único formulario con un despachador en el cliente: el botón que se pulsa
 * decide qué acción corre, y entregar pasa por una confirmación porque es
 * irreversible.
 */
export function ActaEntregaForm({
  ordenId,
  estado,
  acta,
}: {
  ordenId: string;
  estado: string;
  acta: ActaVista | null;
}) {
  const [recibidoPor, setRecibidoPor] = useState(acta?.recibidoPor ?? "");
  const [documentoRecibe, setDocumentoRecibe] = useState(acta?.documentoRecibe ?? "");
  const [observaciones, setObservaciones] = useState(acta?.observaciones ?? "");
  const [modoFirma, setModoFirma] = useState<"pantalla" | "foto">("pantalla");
  // Solo hace falta para el submit de la confirmación (ese botón no lleva name).
  const [accionConfirmada, setAccionConfirmada] = useState<Accion>("borrador");
  const [confirmando, setConfirmando] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (previo: ActaFormState, formData: FormData): Promise<ActaFormState> => {
      const elegida = String(formData.get("accion") ?? "borrador");
      if (elegida === "entregar") return entregarOrdenAction(ordenId, previo, formData);
      if (elegida === "firmar") return firmarActaAction(ordenId, previo, formData);
      return guardarActaAction(ordenId, previo, formData);
    },
    initialState,
  );

  const firmada = Boolean(acta?.firmadaAt);
  const yaEntregada = estado === "ENTREGADA";
  const soloFirma = yaEntregada && !firmada;

  // Cuál de las tres acciones corre lo decide el botón que se pulsa (su
  // `name="accion"` viaja en el FormData): leerlo del estado llegaría un render
  // tarde. La confirmación, que no tiene name propio, usa el campo oculto.
  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    const boton = (evento.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (boton?.value === "entregar" && !confirmando) {
      evento.preventDefault();
      setAccionConfirmada("entregar");
      setConfirmando(true);
    }
  }

  if (firmada && acta) {
    const imagen = acta.firmaUrl ?? acta.firmaFotoUrl;
    return (
      <div className="flex flex-col gap-3 text-sm">
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">Recibe</dt>
            <dd className="mt-0.5 font-medium">{acta.recibidoPor}</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">Documento</dt>
            <dd className="mt-0.5">{acta.documentoRecibe ?? "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">Observaciones</dt>
            <dd className="mt-0.5 text-muted-foreground">{acta.observaciones ?? "—"}</dd>
          </div>
        </dl>
        {imagen ? (
          // eslint-disable-next-line @next/next/no-img-element -- archivo servido por la propia app.
          <img src={imagen} alt={`Firma de ${acta.recibidoPor}`} className="max-w-72 rounded-md border border-border bg-white" />
        ) : null}
        <p role="status" className="text-xs text-muted-foreground">
          Acta firmada el {acta.firmadaAt?.toLocaleDateString("es-CO")}.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={alEnviar} className="flex flex-col gap-4">
      <input type="hidden" name="accion" value={confirmando ? accionConfirmada : estado === "ENTREGADA" ? "firmar" : "borrador"} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recibidoPor">Recibe (nombre)</Label>
          <Input
            id="recibidoPor"
            value={recibidoPor}
            onChange={(evento) => setRecibidoPor(evento.target.value)}
            placeholder="María Pérez"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documentoRecibe">Documento (opcional)</Label>
          <Input
            id="documentoRecibe"
            value={documentoRecibe}
            onChange={(evento) => setDocumentoRecibe(evento.target.value)}
            placeholder="1.020.456.789"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="observaciones">Observaciones de la entrega (opcional)</Label>
          <Textarea
            id="observaciones"
            rows={2}
            maxLength={500}
            value={observaciones}
            onChange={(evento) => setObservaciones(evento.target.value)}
          />
        </div>
      </div>
      <input type="hidden" name="recibidoPor" value={recibidoPor} />
      <input type="hidden" name="documentoRecibe" value={documentoRecibe} />
      <input type="hidden" name="observaciones" value={observaciones} />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Firma</span>
        <div className="flex max-w-64 flex-col gap-1.5">
          <Label htmlFor="modoFirma">Cómo firma el cliente</Label>
          <SelectField
            id="modoFirma"
            items={[
              { value: "pantalla", label: "Firmar en pantalla" },
              { value: "foto", label: "Subir foto del acta firmada" },
            ]}
            value={modoFirma}
            onValueChange={(valor) => setModoFirma(valor as "pantalla" | "foto")}
          />
        </div>

        {modoFirma === "pantalla" ? (
          <FirmaCanvas />
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fotoActa">Foto o escaneo del acta firmada</Label>
            <Input id="fotoActa" name="fotoActa" type="file" accept="image/jpeg,image/png,image/webp" className="max-w-md" />
          </div>
        )}
      </div>

      {confirmando ? (
        <ConfirmacionEnLinea
          pregunta="¿Entregar la orden y firmar el acta? La orden ya no se podrá editar."
          etiquetaConfirmar="Sí, entregar"
          destructiva={false}
          enviaFormulario
          pendiente={isPending}
          onCancelar={() => setConfirmando(false)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {soloFirma ? (
            <Button type="submit" name="accion" value="firmar" disabled={isPending}>
              {isPending ? "Firmando..." : "Firmar el acta"}
            </Button>
          ) : (
            <>
              <Button type="submit" name="accion" value="borrador" variant="outline" disabled={isPending}>
                {isPending ? "Guardando..." : "Guardar sin firmar"}
              </Button>
              <Button type="submit" name="accion" value="entregar" disabled={isPending}>
                {isPending ? "Entregando..." : "Entregar y firmar"}
              </Button>
            </>
          )}
        </div>
      )}

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <p role="status" className="text-xs text-muted-foreground">
          {confirmando ? "Orden entregada y acta firmada." : "Acta guardada."}
        </p>
      ) : null}
    </form>
  );
}
