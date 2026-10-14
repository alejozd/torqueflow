"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { pagarLiquidacionAction, type PagoLiquidacionFormState } from "@/app/actions/liquidacion-actions";
import { formatoDiaBogota } from "@/lib/fecha-bogota";
import { totalLiquidacion } from "@/lib/liquidaciones/calculo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const initialState: PagoLiquidacionFormState = { error: null, success: false };
const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });

const METODOS = [
  { value: "EFECTIVO", label: "Efectivo (sale de la caja)" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "OTRO", label: "Otro" },
];

/**
 * Paga la liquidación de un técnico en el periodo (D10): el ajuste, si lo hay,
 * se pone aquí mismo. El total que se ve es orientativo; la action recalcula en
 * el servidor y crea el gasto de la sede (así entra al arqueo y a la
 * rentabilidad, D8).
 */
export function PagarLiquidacionDialog({
  usuarioId,
  nombre,
  periodo,
  etiquetaPeriodo,
  calculado,
}: {
  usuarioId: string;
  nombre: string;
  periodo: string;
  etiquetaPeriodo: string;
  calculado: number;
}) {
  const [open, setOpen] = useState(false);
  const [ajuste, setAjuste] = useState("");
  const [motivoAjuste, setMotivoAjuste] = useState("");
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [fecha, setFecha] = useState(() => formatoDiaBogota.format(new Date()));
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ajusteNumero = Number(ajuste);
  const total = totalLiquidacion(calculado, Number.isFinite(ajusteNumero) ? ajusteNumero : 0);
  const id = `${usuarioId}-${periodo}`;

  function pagar() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("ajuste", ajuste);
        formData.set("motivoAjuste", motivoAjuste);
        formData.set("metodoPago", metodoPago);
        formData.set("fecha", fecha);
        formData.set("referencia", referencia);

        const result = await pagarLiquidacionAction(usuarioId, periodo, initialState, formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        setError(null);
        setOpen(false);
        toast.success("Liquidación pagada");
      } catch {
        toast.error("No se pudo pagar la liquidación");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Pagar</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar liquidación de {nombre}</DialogTitle>
          <DialogDescription>{etiquetaPeriodo}. Se registra como un gasto de la sede.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-y-1 rounded-md bg-muted/50 p-3 text-sm">
            <dt className="text-muted-foreground">Calculado</dt>
            <dd className="text-right font-mono">{formatoMoneda.format(calculado)}</dd>
            <dt className="font-medium">Total a pagar</dt>
            <dd data-testid="total-a-pagar" className="text-right font-mono font-semibold">
              {formatoMoneda.format(total)}
            </dd>
          </dl>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`ajuste-${id}`}>Ajuste (opcional, puede ser negativo)</Label>
              <Input
                id={`ajuste-${id}`}
                type="number"
                step="0.01"
                inputMode="decimal"
                className="font-mono"
                value={ajuste}
                onChange={(evento) => setAjuste(evento.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`motivo-ajuste-${id}`}>Motivo del ajuste</Label>
              <Input
                id={`motivo-ajuste-${id}`}
                placeholder="Bono, adelanto…"
                value={motivoAjuste}
                onChange={(evento) => setMotivoAjuste(evento.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`metodo-${id}`}>Método de pago</Label>
            <SelectField id={`metodo-${id}`} items={METODOS} value={metodoPago} onValueChange={setMetodoPago} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`fecha-${id}`}>Fecha</Label>
              <Input id={`fecha-${id}`} type="date" value={fecha} onChange={(evento) => setFecha(evento.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`referencia-${id}`}>Referencia (opcional)</Label>
              <Input
                id={`referencia-${id}`}
                value={referencia}
                onChange={(evento) => setReferencia(evento.target.value)}
              />
            </div>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="button" disabled={isPending} onClick={pagar}>
              {isPending ? "Pagando..." : "Pagar liquidación"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
