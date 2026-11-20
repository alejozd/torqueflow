"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { NuevaCitaForm } from "@/app/(dashboard)/citas/nueva-cita-form";
import type { VehiculoOption } from "@/app/actions/cita-actions";
import type { OcupacionCita } from "@/lib/agenda-cita";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * "Agendar cita" desde una cotización (o la orden que generó): el formulario de
 * siempre con el vehículo, el motivo y la cotización ya puestos; solo falta el
 * día y la hora. `abiertoInicial` lo abre de una vez (tras aprobar).
 */
export function AgendarCitaDialog({
  cotizacionId,
  vehiculo,
  motivo,
  ocupacion,
  abiertoInicial = false,
  onCerrar,
  etiquetaBoton = "Agendar cita",
  conBoton = true,
}: {
  cotizacionId: string;
  vehiculo: VehiculoOption;
  motivo: string;
  ocupacion: OcupacionCita[];
  abiertoInicial?: boolean;
  /** Al cerrar la ventana, con `agendada` en true si se creó la cita. */
  onCerrar?: (agendada: boolean) => void;
  etiquetaBoton?: string;
  /** Sin botón, la ventana solo se abre con `abiertoInicial`. */
  conBoton?: boolean;
}) {
  const [open, setOpen] = useState(abiertoInicial);

  function cerrar(agendada: boolean) {
    setOpen(false);
    onCerrar?.(agendada);
  }

  return (
    <>
      {conBoton ? (
        <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <CalendarPlus />
          {etiquetaBoton}
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={(abierto) => (abierto ? setOpen(true) : cerrar(false))}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agendar cita</DialogTitle>
            <DialogDescription>
              {vehiculo.placa} · {vehiculo.clienteNombre}. Escoge el día y la hora en que el cliente trae el vehículo.
            </DialogDescription>
          </DialogHeader>
          <NuevaCitaForm
            vehiculos={[vehiculo]}
            ocupacion={ocupacion}
            valoresIniciales={{ vehiculoId: vehiculo.id, motivo }}
            cotizacionId={cotizacionId}
            onCreated={() => cerrar(true)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
