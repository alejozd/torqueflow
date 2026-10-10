import { AlertTriangle } from "lucide-react";
import {
  diasHastaVencimiento,
  estadoVencimiento,
  formatoFechaVencimiento,
  NOMBRE_DOCUMENTO,
  requiereAviso,
  type TipoDocumento,
} from "@/lib/vencimientos/estado-vencimiento";

/** Informativo, nunca bloquea la creación de la orden. */
export function AvisoVencimientosOrden({
  soatVence,
  tecnomecanicaVence,
  diasAviso,
}: {
  soatVence: Date | null;
  tecnomecanicaVence: Date | null;
  diasAviso: number;
}) {
  const ahora = new Date();
  const documentos: [TipoDocumento, Date | null][] = [
    ["SOAT", soatVence],
    ["TECNOMECANICA", tecnomecanicaVence],
  ];
  const lineas = documentos.flatMap(([tipo, fecha]) => {
    if (!fecha || !requiereAviso(estadoVencimiento(fecha, ahora, diasAviso))) return [];
    const vencido = diasHastaVencimiento(fecha, ahora) < 0;
    return [`${NOMBRE_DOCUMENTO[tipo]} ${vencido ? "vencido el" : "vence el"} ${formatoFechaVencimiento.format(fecha)}`];
  });
  if (lineas.length === 0) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-[oklch(0.7_0.15_60/0.4)] bg-[oklch(0.7_0.15_60/0.1)] px-3 py-2 text-xs text-[oklch(0.45_0.12_60)]"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p>{lineas.join(" · ")} — recuérdaselo al cliente.</p>
    </div>
  );
}
