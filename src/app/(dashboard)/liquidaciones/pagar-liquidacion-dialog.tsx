"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { pagarLiquidacionAction, type PagoLiquidacionFormState } from "@/app/actions/liquidacion-actions";
import { formatoDiaBogota } from "@/lib/fecha-bogota";
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
 * Paga una liquidación: la action crea el gasto de la sede con la categoría del
 * sistema, así que el pago queda en el arqueo de caja y en la rentabilidad (D8).
 */
export function PagarLiquidacionDialog({
  liquidacionId,
  nombre,
  periodo,
  total,
}: {
  liquidacionId: string;
  nombre: string;
  periodo: string;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [fecha, setFecha] = useState(formatoDiaBogota.format(new Date()));
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function pagar() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("metodoPago", metodoPago);
        formData.set("fecha", fecha);
        formData.set("referencia", referencia);

        const result = await pagarLiquidacionAction(liquidacionId, initialState, formData);
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
          <DialogDescription>
            {periodo} · {formatoMoneda.format(total)}. Se registra como un gasto de la sede.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`metodo-${liquidacionId}`}>Método de pago</Label>
            <SelectField id={`metodo-${liquidacionId}`} items={METODOS} value={metodoPago} onValueChange={setMetodoPago} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`fecha-${liquidacionId}`}>Fecha</Label>
              <Input
                id={`fecha-${liquidacionId}`}
                type="date"
                value={fecha}
                onChange={(evento) => setFecha(evento.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`referencia-${liquidacionId}`}>Referencia (opcional)</Label>
              <Input
                id={`referencia-${liquidacionId}`}
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
