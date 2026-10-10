"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  devolverAnticipoAction,
  registrarAnticipoAction,
  type AnticipoFila,
  type AnticipoFormState,
} from "@/app/actions/anticipo-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const initialState: AnticipoFormState = { error: null, success: false };

// ANTICIPO es un método interno (pagos generados al facturar): nunca se ofrece aquí.
const METODOS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "OTRO", label: "Otro" },
];

const METODO_LABEL: Record<string, string> = {
  ...Object.fromEntries(METODOS.map((m) => [m.value, m.label])),
  ANTICIPO: "Anticipo",
};

const ESTADO_LABEL: Record<AnticipoFila["estado"], string> = {
  PENDIENTE: "Pendiente",
  APLICADO: "Aplicado",
  DEVUELTO: "Devuelto",
};

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

export function AnticiposSection({
  ordenId,
  anticipos,
  puedeRegistrar,
  puedeDevolver,
  ordenAnulada,
}: {
  ordenId: string;
  anticipos: AnticipoFila[];
  /** ADMIN/RECEPCION y la orden sin factura ni anulada. */
  puedeRegistrar: boolean;
  /** Solo ADMIN. */
  puedeDevolver: boolean;
  ordenAnulada: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [devolviendoId, setDevolviendoId] = useState<string | null>(null);
  const [metodoDevolucion, setMetodoDevolucion] = useState("EFECTIVO");

  const hayPendientes = anticipos.some((a) => a.estado === "PENDIENTE");

  function registrar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    startTransition(async () => {
      try {
        const result = await registrarAnticipoAction(ordenId, initialState, formData);
        if (result.success) {
          setError(null);
          formRef.current?.reset();
          toast.success("Anticipo registrado");
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        toast.error("No se pudo registrar el anticipo");
      }
    });
  }

  function devolver(anticipoId: string) {
    const formData = new FormData();
    formData.set("metodoDevolucion", metodoDevolucion);
    startTransition(async () => {
      try {
        const result = await devolverAnticipoAction(anticipoId, initialState, formData);
        if (result.success) {
          setError(null);
          setDevolviendoId(null);
          toast.success("Anticipo devuelto");
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        toast.error("No se pudo devolver el anticipo");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {ordenAnulada && hayPendientes ? (
        <Alert variant="destructive">
          <AlertDescription>Hay anticipos por devolver</AlertDescription>
        </Alert>
      ) : null}

      {puedeRegistrar ? (
        <form ref={formRef} onSubmit={registrar} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="anticipo-monto">Monto</Label>
            <Input id="anticipo-monto" name="monto" type="number" min="0.01" step="0.01" required className="font-mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="anticipo-metodo">Método de pago</Label>
            <SelectField id="anticipo-metodo" name="metodoPago" defaultValue="EFECTIVO" items={METODOS} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="anticipo-referencia">Referencia (opcional)</Label>
            <Input id="anticipo-referencia" name="referencia" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="invisible">Registrar</Label>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Registrando..." : "Registrar anticipo"}
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {anticipos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Esta orden no tiene anticipos.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {anticipos.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium">{formatoMoneda.format(a.monto)}</span>
                  <span className="text-muted-foreground">{METODO_LABEL[a.metodoPago] ?? a.metodoPago}</span>
                  <Badge variant={a.estado === "PENDIENTE" ? "outline" : "secondary"}>{ESTADO_LABEL[a.estado]}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatoFecha.format(a.createdAt)} · {a.registradoPorNombre}
                  {a.referencia ? ` · ${a.referencia}` : ""}
                </span>
              </div>
              {puedeDevolver && a.estado === "PENDIENTE" ? (
                devolviendoId === a.id ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`devolucion-${a.id}`}>Método de devolución</Label>
                      <SelectField
                        id={`devolucion-${a.id}`}
                        value={metodoDevolucion}
                        onValueChange={setMetodoDevolucion}
                        items={METODOS}
                      />
                    </div>
                    <ConfirmacionEnLinea
                      pregunta="¿Devolver este anticipo al cliente?"
                      etiquetaConfirmar="Sí, devolver"
                      pendiente={isPending}
                      onConfirmar={() => devolver(a.id)}
                      onCancelar={() => setDevolviendoId(null)}
                    />
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      setMetodoDevolucion("EFECTIVO");
                      setDevolviendoId(a.id);
                    }}
                  >
                    Devolver
                  </Button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
