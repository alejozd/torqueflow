import Link from "next/link";
import { ChevronRight, FileWarning } from "lucide-react";

/** Aviso de Inicio: solo aparece si hay facturas sin enviar, pendientes, por confirmar o rechazadas. */
export function AvisoFacturasDian({ cantidad }: { cantidad: number }) {
  if (cantidad <= 0) return null;
  return (
    <Link
      href="/facturas?dian=pendientes"
      className="flex items-center gap-3 rounded-xl border border-[oklch(0.7_0.15_60/0.4)] bg-[oklch(0.7_0.15_60/0.1)] px-4 py-3 text-sm font-medium text-[oklch(0.45_0.12_60)] hover:bg-[oklch(0.7_0.15_60/0.15)]"
    >
      <FileWarning className="size-4 shrink-0" />
      <span className="flex-1">
        {cantidad} {cantidad === 1 ? "factura sin enviar a la DIAN" : "facturas sin enviar a la DIAN"} o con algo por resolver
      </span>
      <ChevronRight className="size-4 shrink-0" />
    </Link>
  );
}
