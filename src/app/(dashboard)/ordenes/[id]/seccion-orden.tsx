"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Una sección plegable de la ficha de la orden. El encabezado (título, resumen y
 * flecha) pliega y despliega; los botones propios de la sección (`accion`, por
 * ejemplo "Imprimir acta") van fuera de esa zona para no plegarla. Plegada, el
 * contenido solo se oculta (`hidden`): un formulario a medio llenar no se pierde.
 * Saltar a ella desde la barra de secciones (enlace a `#id` o cambio de `#`) la
 * abre.
 */
export function SeccionOrden({
  id,
  titulo,
  resumen,
  accion,
  abiertaInicial,
  destacada = false,
  contenidoClassName,
  children,
}: {
  id: string;
  titulo: ReactNode;
  /** Lo que se lee con la sección plegada ("3 ítems · $450.000"). */
  resumen?: ReactNode;
  accion?: ReactNode;
  abiertaInicial: boolean;
  /** Resaltada: es la sección que toca ahora (el acta con la orden terminada). */
  destacada?: boolean;
  contenidoClassName?: string;
  children: ReactNode;
}) {
  const [abierta, setAbierta] = useState(abiertaInicial);
  const idContenido = useId();

  useEffect(() => {
    const abrirSiEsEsta = () => {
      if (window.location.hash === `#${id}`) setAbierta(true);
    };
    // Un clic en un enlace a esta sección abre antes del salto (si el # ya era
    // este, no hay hashchange); la dirección con #id al cargar, en el siguiente cuadro.
    const alHacerClic = (evento: MouseEvent) => {
      if ((evento.target as HTMLElement | null)?.closest(`a[href="#${id}"]`)) setAbierta(true);
    };
    window.addEventListener("hashchange", abrirSiEsEsta);
    document.addEventListener("click", alHacerClic);
    const cuadro = requestAnimationFrame(abrirSiEsEsta);
    return () => {
      window.removeEventListener("hashchange", abrirSiEsEsta);
      document.removeEventListener("click", alHacerClic);
      cancelAnimationFrame(cuadro);
    };
  }, [id]);

  return (
    <Card id={id} className={cn("scroll-mt-16", destacada && "ring-2 ring-teal-500/50")}>
      <CardHeader className={cn(!abierta && "-mb-(--card-spacing)")}>
        <CardTitle>
          <button
            type="button"
            aria-expanded={abierta}
            aria-controls={idContenido}
            onClick={() => setAbierta((valor) => !valor)}
            className="-m-1 flex w-full cursor-pointer items-center gap-2 rounded-md p-1 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronDown
              aria-hidden
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !abierta && "-rotate-90")}
            />
            <span className="flex flex-wrap items-baseline gap-x-1.5">
              <span>{titulo}</span>
              {resumen ? <span className="text-sm font-normal text-muted-foreground">· {resumen}</span> : null}
            </span>
          </button>
        </CardTitle>
        {accion ? <CardAction>{accion}</CardAction> : null}
      </CardHeader>
      <CardContent id={idContenido} hidden={!abierta} className={cn("flex flex-col gap-4", contenidoClassName, !abierta && "hidden")}>
        {children}
      </CardContent>
    </Card>
  );
}
