"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cerrarCajaAction } from "@/app/actions/caja-actions";
import { diferenciaCierre } from "@/lib/caja/resumen";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function CerrarCajaForm({ cajaId, efectivoEsperado }: { cajaId: string; efectivoEsperado: number }) {
  const [contado, setContado] = useState("");
  const [notas, setNotas] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const valor = contado.trim() === "" ? null : Number(contado);
  const cierre = valor !== null && Number.isFinite(valor) ? diferenciaCierre(efectivoEsperado, valor) : null;

  function pedirConfirmacion(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!cierre) {
      setError("Ingresa el efectivo contado");
      return;
    }
    setError(null);
    setConfirmando(true);
  }

  function cerrar() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("efectivoContado", contado);
        formData.set("notas", notas);
        const result = await cerrarCajaAction(cajaId, { error: null, success: false }, formData);
        if (result.success) toast.success("Caja cerrada");
        else {
          setConfirmando(false);
          setError(result.error);
        }
      } catch {
        setConfirmando(false);
        toast.error("No se pudo cerrar la caja");
      }
    });
  }

  return (
    <form noValidate onSubmit={pedirConfirmacion} className="flex flex-col gap-4 sm:max-w-md">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="caja-contado">Efectivo contado</Label>
        <Input
          id="caja-contado"
          type="number"
          min="0"
          step="1"
          className="font-mono"
          value={contado}
          disabled={confirmando}
          onChange={(evento) => setContado(evento.target.value)}
        />
        {cierre ? (
          <p
            className={
              cierre.tipo === "CUADRA"
                ? "text-sm font-medium text-green-600 dark:text-green-400"
                : "text-sm font-medium text-orange-600 dark:text-orange-400"
            }
          >
            {cierre.tipo === "CUADRA"
              ? "Cuadra"
              : `${cierre.tipo === "SOBRANTE" ? "Sobrante" : "Faltante"}: ${formatoMoneda.format(Math.abs(cierre.diferencia))}`}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="caja-notas">Notas (opcional)</Label>
        <Textarea
          id="caja-notas"
          maxLength={300}
          value={notas}
          disabled={confirmando}
          onChange={(evento) => setNotas(evento.target.value)}
        />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {confirmando ? (
        <ConfirmacionEnLinea
          pregunta="¿Cerrar la caja? No se puede reabrir."
          etiquetaConfirmar="Sí, cerrar caja"
          onCancelar={() => setConfirmando(false)}
          onConfirmar={cerrar}
          pendiente={isPending}
        />
      ) : (
        <div>
          <Button type="submit">Cerrar caja</Button>
        </div>
      )}
    </form>
  );
}
