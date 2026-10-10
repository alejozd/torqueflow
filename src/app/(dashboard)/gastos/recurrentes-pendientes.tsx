"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmarRecurrenteAction, omitirRecurrenteAction } from "@/app/actions/gasto-recurrente-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ETIQUETA_MES } from "@/lib/gastos/periodo";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export interface PendienteVista {
  recurrenteId: string;
  descripcion: string;
  categoriaNombre: string;
  periodo: string;
  fechaSugerida: Date;
  montoEstimado: number;
}

function ConfirmarDialog({ pendiente }: { pendiente: PendienteVista }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const idBase = `${pendiente.recurrenteId}-${pendiente.periodo}`;

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    startTransition(async () => {
      try {
        const result = await confirmarRecurrenteAction(pendiente.recurrenteId, pendiente.periodo, { error: null, success: false }, formData);
        if (result.success) {
          toast.success("Gasto confirmado");
          setOpen(false);
        } else {
          setError(result.error);
        }
      } catch {
        toast.error("No se pudo confirmar el gasto");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Confirmar</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar gasto recurrente</DialogTitle>
          <DialogDescription>
            {pendiente.descripcion} · {ETIQUETA_MES(pendiente.periodo)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`rec-monto-${idBase}`}>Monto</Label>
            <Input
              id={`rec-monto-${idBase}`}
              name="monto"
              type="number"
              min="1"
              step="1"
              className="font-mono"
              defaultValue={String(pendiente.montoEstimado)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`rec-fecha-${idBase}`}>Fecha</Label>
            <Input
              id={`rec-fecha-${idBase}`}
              name="fecha"
              type="date"
              defaultValue={pendiente.fechaSugerida.toISOString().slice(0, 10)}
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Confirmar gasto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OmitirBoton({ pendiente }: { pendiente: PendienteVista }) {
  const [confirmando, setConfirmando] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirmando) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setConfirmando(true)}>
        Omitir este mes
      </Button>
    );
  }
  return (
    <ConfirmacionEnLinea
      pregunta={`¿Omitir "${pendiente.descripcion}" en ${ETIQUETA_MES(pendiente.periodo)}?`}
      etiquetaConfirmar="Sí, omitir"
      destructiva={false}
      pendiente={isPending}
      onCancelar={() => setConfirmando(false)}
      onConfirmar={() =>
        startTransition(async () => {
          try {
            const result = await omitirRecurrenteAction(pendiente.recurrenteId, pendiente.periodo);
            if (result.error) toast.error(result.error);
            else toast.success("Gasto omitido");
          } catch {
            toast.error("No se pudo omitir el gasto");
          }
          setConfirmando(false);
        })
      }
    />
  );
}

export function RecurrentesPendientes({ pendientes, esAdmin }: { pendientes: PendienteVista[]; esAdmin: boolean }) {
  if (pendientes.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos recurrentes por confirmar</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {pendientes.map((p) => (
            <li
              key={`${p.recurrenteId}-${p.periodo}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{p.descripcion}</span>
                <span className="text-sm text-muted-foreground">
                  {p.categoriaNombre} · {ETIQUETA_MES(p.periodo)} · {formatoMoneda.format(p.montoEstimado)}
                </span>
              </div>
              {esAdmin ? (
                <div className="flex flex-wrap items-center gap-2">
                  <ConfirmarDialog pendiente={p} />
                  <OmitirBoton pendiente={p} />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">El administrador debe confirmarlo</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
