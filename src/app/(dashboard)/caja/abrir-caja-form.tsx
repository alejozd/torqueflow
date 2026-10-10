"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { abrirCajaAction } from "@/app/actions/caja-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AbrirCajaForm({ sedeId }: { sedeId: string }) {
  const [base, setBase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("baseInicial", base);
        formData.set("sedeId", sedeId);
        const result = await abrirCajaAction({ error: null, success: false }, formData);
        if (result.success) toast.success("Caja abierta");
        else setError(result.error);
      } catch {
        toast.error("No se pudo abrir la caja");
      }
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4 sm:max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="caja-base">Base inicial</Label>
        <Input
          id="caja-base"
          type="number"
          min="0"
          step="1"
          className="font-mono"
          value={base}
          onChange={(evento) => setBase(evento.target.value)}
        />
        <p className="text-xs text-muted-foreground">Efectivo con el que arranca la caja.</p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Abriendo..." : "Abrir caja"}
        </Button>
      </div>
    </form>
  );
}
