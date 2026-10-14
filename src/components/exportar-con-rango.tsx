"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rangoPorDefecto, resolverRangoExportacion } from "@/lib/exportacion/rango-fechas";
import { cn } from "@/lib/utils";

/**
 * Exportación con rango de fechas (consolidación, D9). Es un formulario GET
 * nativo hacia la ruta de exportación: la descarga la hace el navegador, como
 * con el enlace directo. Valida con la misma regla que el servidor antes de
 * enviar, para que un rango inválido se corrija aquí y no termine en una
 * página de error 400.
 */
export function ExportarConRango({ reporte, etiqueta }: { reporte: string; etiqueta: string }) {
  const id = useId();
  const [porDefecto] = useState(() => rangoPorDefecto(new Date()));
  const [error, setError] = useState<string | null>(null);
  const desplegable = useRef<HTMLDetailsElement>(null);

  // Se cierra con un clic fuera, como cualquier menú. Solo toca el DOM (el
  // atributo `open` de <details>), no el estado de React.
  useEffect(() => {
    function alPulsarFuera(evento: PointerEvent) {
      const elemento = desplegable.current;
      if (elemento?.open && !elemento.contains(evento.target as Node)) elemento.open = false;
    }
    document.addEventListener("pointerdown", alPulsarFuera);
    return () => document.removeEventListener("pointerdown", alPulsarFuera);
  }, []);

  function alPulsarTecla(evento: KeyboardEvent<HTMLDetailsElement>) {
    if (evento.key === "Escape" && desplegable.current) desplegable.current.open = false;
  }

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    const datos = new FormData(evento.currentTarget);
    const resultado = resolverRangoExportacion(
      { desde: String(datos.get("desde") ?? ""), hasta: String(datos.get("hasta") ?? "") },
      new Date(),
    );
    if ("error" in resultado) {
      evento.preventDefault();
      setError(resultado.error);
      return;
    }
    setError(null);
  }

  return (
    <details ref={desplegable} className="relative" onKeyDown={alPulsarTecla}>
      <summary
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
        )}
      >
        {etiqueta}
        <ChevronDown className="size-4" aria-hidden />
      </summary>
      <form
        method="get"
        action={`/api/exportar/${reporte}`}
        onSubmit={alEnviar}
        noValidate
        className="absolute right-0 z-20 mt-2 flex w-64 flex-col gap-3 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-desde`}>Desde</Label>
          <Input id={`${id}-desde`} type="date" name="desde" defaultValue={porDefecto.desde} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-hasta`}>Hasta</Label>
          <Input id={`${id}-hasta`} type="date" name="hasta" defaultValue={porDefecto.hasta} />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Máximo 366 días.</p>
        )}
        <Button type="submit" size="sm">
          Descargar Excel
        </Button>
      </form>
    </details>
  );
}
