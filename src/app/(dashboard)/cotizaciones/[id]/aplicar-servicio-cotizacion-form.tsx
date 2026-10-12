"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  aplicarServicioACotizacionAction,
  type AplicarServicioFormState,
  type ServicioVista,
} from "@/app/actions/servicio-actions";
import { mensajeServicioAplicado } from "@/lib/servicio/mensaje-aplicado";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";

const initialState: AplicarServicioFormState = { error: null, success: false, agregados: null };
const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });

/**
 * Aplica un servicio (o kit) del catálogo a la cotización: prellena la línea de
 * mano de obra y las de repuestos, y la action recomputa los totales. Solo
 * ofrece servicios activos y con el kit de la sede activa.
 */
export function AplicarServicioCotizacionForm({
  cotizacionId,
  servicios,
}: {
  cotizacionId: string;
  servicios: ServicioVista[];
}) {
  const [servicioId, setServicioId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function aplicar() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        // El Combobox no es un campo nativo: no llena FormData por sí solo.
        formData.set("servicioId", servicioId);

        const result = await aplicarServicioACotizacionAction(cotizacionId, initialState, formData);
        if (result.error || !result.agregados) {
          setError(result.error ?? "No se pudo aplicar el servicio");
          return;
        }
        setError(null);
        setServicioId("");
        toast.success(mensajeServicioAplicado(result.agregados));
      } catch {
        toast.error("No se pudo aplicar el servicio");
      }
    });
  }

  // Sin servicios activos en esta sede no hay nada que ofrecer.
  if (servicios.length === 0) return null;

  const opciones: ComboboxOption[] = servicios.map((servicio) => ({
    value: servicio.id,
    label: `${servicio.nombre}${servicio.repuestos.length > 0 ? ` — Kit · ${servicio.repuestos.length} repuestos` : ""} · ${formatoMoneda.format(servicio.totalEstimado)}`,
  }));

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cotizacion-servicio">Aplicar servicio del catálogo</Label>
          <Combobox
            id="cotizacion-servicio"
            items={opciones}
            value={servicioId}
            onValueChange={setServicioId}
            placeholder="Buscar servicio o kit"
            emptyMessage="Ningún servicio coincide"
          />
        </div>
        <Button type="button" disabled={isPending} onClick={aplicar}>
          {isPending ? "Aplicando..." : "Aplicar servicio"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Agrega la mano de obra y los repuestos del kit de una vez, al precio de venta actual del inventario, y recalcula
        los totales de la cotización. Después puedes editar o quitar cada línea como cualquier otra.
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
