import { buttonVariants } from "@/components/ui/button";
import { tieneRango } from "@/lib/exportacion/rango-fechas";
import { ExportarConRango } from "./exportar-con-rango";

/**
 * Descarga de un reporte (Fase 24). Tiene que ser un `<a>` (o un formulario GET)
 * de verdad: `next/link` haría una navegación del cliente y no una descarga del
 * navegador (las rutas de API no son páginas, así que la regla de Next sobre
 * enlaces internos no las cubre). Un solo sitio para las cuatro pantallas.
 * Ventas y arqueos piden antes el rango de fechas (consolidación, D9).
 */
export function BotonExportar({ reporte, etiqueta }: { reporte: string; etiqueta: string }) {
  if (tieneRango(reporte)) return <ExportarConRango reporte={reporte} etiqueta={etiqueta} />;
  return (
    <a href={`/api/exportar/${reporte}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {etiqueta}
    </a>
  );
}
