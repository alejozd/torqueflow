"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { AgendarCitaDialog } from "@/app/(dashboard)/cotizaciones/[id]/agendar-cita-dialog";
import type { VehiculoOption } from "@/app/actions/cita-actions";
import type { OcupacionCita } from "@/lib/agenda-cita";
import { Button } from "@/components/ui/button";

/**
 * La cita en que el cliente trae el vehículo de una orden que salió de una
 * cotización. Con cita, una línea con el enlace; recién aprobada la cotización
 * (`preguntar`), la pregunta "¿Agendar la cita?" que abre el formulario prellenado.
 */
export function CitaOrden({
  cita,
  preguntar,
  agendar,
}: {
  cita: { id: string; texto: string } | null;
  preguntar: boolean;
  agendar: { cotizacionId: string; vehiculo: VehiculoOption; motivo: string; ocupacion: OcupacionCita[] } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [fase, setFase] = useState<"pregunta" | "formulario" | "cerrada">(preguntar ? "pregunta" : "cerrada");

  // Quita ?agendarCita=1 para que recargar no vuelva a preguntar.
  function cerrar() {
    setFase("cerrada");
    router.replace(`${pathname}?tab=recepcion`, { scroll: false });
  }

  if (cita) {
    return (
      <Link
        href={`/citas/${cita.id}`}
        className="flex w-fit items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm hover:bg-muted"
      >
        <CalendarClock className="size-4 text-primary" aria-hidden />
        <span>
          Cita: <span className="font-medium">{cita.texto}</span>
        </span>
      </Link>
    );
  }

  if (!agendar || fase === "cerrada") return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <p className="flex items-center gap-2 text-sm">
        <CalendarClock className="size-4 text-primary" aria-hidden />
        Cotización aprobada. ¿Agendar la cita para que el cliente traiga el vehículo?
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={cerrar}>
          Ahora no
        </Button>
        <Button type="button" size="sm" onClick={() => setFase("formulario")}>
          Agendar cita
        </Button>
      </div>
      {fase === "formulario" ? (
        <AgendarCitaDialog
          cotizacionId={agendar.cotizacionId}
          vehiculo={agendar.vehiculo}
          motivo={agendar.motivo}
          ocupacion={agendar.ocupacion}
          conBoton={false}
          abiertoInicial
          onCerrar={(agendada) => (agendada ? cerrar() : setFase("pregunta"))}
        />
      ) : null}
    </div>
  );
}
