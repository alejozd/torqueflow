import { buttonVariants } from "@/components/ui/button";

/**
 * Enlace de descarga de un reporte (Fase 24). Tiene que ser un `<a>` de verdad:
 * `next/link` haría una navegación del cliente y no una descarga del navegador
 * (las rutas de API no son páginas, así que la regla de Next sobre enlaces
 * internos no las cubre). Un solo sitio para las cuatro pantallas.
 */
export function BotonExportar({ reporte, etiqueta }: { reporte: string; etiqueta: string }) {
  return (
    <a href={`/api/exportar/${reporte}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {etiqueta}
    </a>
  );
}
