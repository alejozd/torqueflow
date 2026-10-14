import { cn } from "@/lib/utils";

export interface SeccionNav {
  /** El `id` de la sección destino en la página. */
  id: string;
  label: string;
  /** Clase de color del punto (`bg-…`), el color dominante de la sección. */
  dot: string;
}

/**
 * Barra de botones a las secciones de una página larga (Inicio, ficha de la
 * orden): deja ver que hay más abajo y salta directo a cada parte. Queda fija
 * arriba al hacer scroll (el encabezado del layout no es fijo, así que esta
 * barra pasa a ser la referencia). Cada sección destino lleva `scroll-mt-16`
 * para no quedar tapada por ella.
 */
export function NavSecciones({
  secciones,
  etiqueta,
  className,
}: {
  secciones: readonly SeccionNav[];
  etiqueta: string;
  /** Para ajustar el margen al espacio entre bloques de cada página. */
  className?: string;
}) {
  return (
    <nav
      aria-label={etiqueta}
      className={cn(
        "sticky top-0 z-10 -mt-4 flex gap-2 overflow-x-auto border-b bg-slate-50/95 py-2 backdrop-blur supports-backdrop-filter:bg-slate-50/75 dark:bg-slate-900/75",
        className,
      )}
    >
      {secciones.map((seccion) => (
        <a
          key={seccion.id}
          href={`#${seccion.id}`}
          className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span className={cn("size-2 shrink-0 rounded-full", seccion.dot)} />
          {seccion.label}
        </a>
      ))}
    </nav>
  );
}
