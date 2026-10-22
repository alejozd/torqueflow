"use client";

import { useActionState, useState, type FormEvent } from "react";
import {
  borrarActaAction,
  entregarOrdenAction,
  firmarActaAction,
  guardarActaAction,
  type ActaFormState,
} from "@/app/actions/recepcion-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { QuitarConConfirmacion } from "@/components/quitar-con-confirmacion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { FirmaCanvas } from "./firma-canvas";

type Accion = "borrador" | "firmar" | "entregar";
/** El resultado recuerda qué acción lo produjo: el mensaje de éxito depende de ella. */
type EstadoFormulario = ActaFormState & { accion?: Accion };

const initialState: EstadoFormulario = { error: null, success: false };

const MENSAJE_EXITO: Record<Accion, string> = {
  borrador: "Acta guardada.",
  firmar: "Acta firmada.",
  entregar: "Orden entregada.",
};

/** Borra el borrador del acta; se define fuera del render (react-hooks/static-components). */
function BorrarActa({ ordenId }: { ordenId: string }) {
  return (
    <QuitarConConfirmacion
      etiqueta="Borrar acta"
      pregunta="¿Borrar el acta de entrega? Se pierden los datos cargados."
      accion={borrarActaAction.bind(null, ordenId)}
    />
  );
}

export interface ActaVista {
  recibidoPor: string;
  documentoRecibe: string | null;
  observaciones: string | null;
  firmaUrl: string | null;
  firmaFotoUrl: string | null;
  firmadaAt: Date | null;
}

/**
 * Acta de entrega (D4/D5/D6): los datos de quien recibe, la firma (en pantalla o
 * foto del papel) y los tres desenlaces posibles:
 *
 * - `borrador`: guarda los datos sin firmar (la orden sigue abierta),
 * - `entregar`: pasa la orden a ENTREGADA (con la firma, o sin ella si el taller
 *   no la exige: fase de consolidación, D1),
 * - `firmar`: la orden ya se entregó y el cliente firma más tarde.
 *
 * Solo una orden TERMINADA ofrece entregar; antes, el formulario dice por qué no.
 *
 * Un único formulario con un despachador en el cliente: el botón que se pulsa
 * decide qué acción corre, y entregar pasa por una confirmación porque es
 * irreversible.
 */
export function ActaEntregaForm({
  ordenId,
  estado,
  acta,
  editable,
  exigirFirma = false,
  puedeBorrar = false,
  permitirEntrega,
}: {
  ordenId: string;
  estado: string;
  acta: ActaVista | null;
  /** Falso solo para una orden anulada: el acta queda de solo lectura. */
  editable: boolean;
  /** Opción del taller "Exigir acta firmada al entregar". */
  exigirFirma?: boolean;
  /** ADMIN/RECEPCION: puede borrar el borrador del acta. */
  puedeBorrar?: boolean;
  /** `ordenes.entregar`: sin él se arma el acta pero no se entrega. Obligatoria, sin valor por defecto. */
  permitirEntrega: boolean;
}) {
  const [recibidoPor, setRecibidoPor] = useState(acta?.recibidoPor ?? "");
  const [documentoRecibe, setDocumentoRecibe] = useState(acta?.documentoRecibe ?? "");
  const [observaciones, setObservaciones] = useState(acta?.observaciones ?? "");
  const [modoFirma, setModoFirma] = useState<"pantalla" | "foto">("pantalla");
  const [confirmando, setConfirmando] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> => {
      const valor = String(formData.get("accion") ?? "borrador");
      const accion: Accion = valor === "entregar" || valor === "firmar" ? valor : "borrador";
      const correr = { entregar: entregarOrdenAction, firmar: firmarActaAction, borrador: guardarActaAction }[accion];
      return { ...(await correr(ordenId, previo, formData)), accion };
    },
    initialState,
  );

  const firmada = Boolean(acta?.firmadaAt);
  const yaEntregada = estado === "ENTREGADA";
  const soloFirma = yaEntregada && !firmada;
  const terminada = estado === "TERMINADA";
  const puedeEntregar = terminada && permitirEntrega;

  // Al entregar, el servidor revalida y esta misma instancia recibe la orden ya
  // entregada: la confirmación de "entregar" no puede quedar abierta encima del
  // botón de firmar. Se ajusta durante el render (no en un efecto).
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    setConfirmando(false);
  }

  // Cuál de las tres acciones corre lo decide el botón que se pulsa (su
  // `name="accion"` viaja en el FormData y también funciona sin JS): leerlo del
  // estado llegaría un render tarde. El botón de la confirmación lleva el mismo
  // name/value, así que no hace falta ningún campo oculto.
  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    const boton = (evento.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (boton?.value === "entregar" && !confirmando) {
      evento.preventDefault();
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

  // Orden anulada (o ya no editable sin firma): el acta se consulta, no se toca.
  if (!editable) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        {acta ? (
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">Recibe</dt>
              <dd className="mt-0.5 font-medium">{acta.recibidoPor}</dd>
            </div>
            <div>
              <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">Documento</dt>
              <dd className="mt-0.5">{acta.documentoRecibe ?? "—"}</dd>
            </div>
          </dl>
        ) : null}
        <p className="text-xs text-muted-foreground">La orden está anulada: el acta de entrega no se puede modificar.</p>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={alEnviar} className="flex flex-col gap-4">
      {soloFirma ? (
        <p className="text-xs text-muted-foreground">
          La orden se entregó sin firma. Si quien recibió quiere firmar, puede hacerlo aquí.
        </p>
      ) : null}
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
          pregunta={
            exigirFirma
              ? "¿Entregar la orden con el acta firmada? La orden ya no se podrá editar."
              : "¿Entregar la orden? Si quien recibe no firmó, el acta queda sin firma y se puede firmar después. La orden ya no se podrá editar."
          }
          etiquetaConfirmar="Sí, entregar"
          destructiva={false}
          enviaFormulario
          pendiente={isPending}
          nombreBoton="accion"
          valorBoton="entregar"
          onCancelar={() => setConfirmando(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {soloFirma ? (
            <Button type="submit" name="accion" value="firmar" disabled={isPending}>
              {isPending ? "Firmando..." : "Firmar el acta"}
            </Button>
          ) : (
            <>
              <Button type="submit" name="accion" value="borrador" variant="outline" disabled={isPending}>
                {isPending ? "Guardando..." : "Guardar sin firmar"}
              </Button>
              {puedeEntregar ? (
                <Button type="submit" name="accion" value="entregar" disabled={isPending}>
                  {isPending ? "Entregando..." : exigirFirma ? "Entregar y firmar" : "Entregar"}
                </Button>
              ) : null}
              {acta && puedeBorrar ? <BorrarActa ordenId={ordenId} /> : null}
            </>
          )}
        </div>
      )}
      {!soloFirma && terminada && !permitirEntrega ? (
        <p className="text-xs text-muted-foreground">La entrega la hacen Recepción o el Jefe de taller.</p>
      ) : null}
      {!soloFirma && !terminada ? (
        <p className="text-xs text-muted-foreground">
          La orden se entrega cuando esté Terminada: por ahora puedes ir dejando los datos del acta.
        </p>
      ) : null}
      {!soloFirma && puedeEntregar && exigirFirma ? (
        <p className="text-xs text-muted-foreground">Este taller exige la firma de quien recibe para entregar.</p>
      ) : null}

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <p role="status" className="text-xs text-muted-foreground">
          {MENSAJE_EXITO[state.accion ?? "borrador"]}
        </p>
      ) : null}
    </form>
  );
}
