"use client";

import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Los tres caminos para sumar trabajo en un solo sitio: cada botón despliega su
 * formulario (el que ya existía) y solo uno queda abierto. Los formularios no se
 * desmontan al cerrarlos, así no pierden lo escrito.
 */
export function AgregarAlTrabajo({
  opciones,
}: {
  opciones: { id: string; etiqueta: string; detalle?: string; contenido: ReactNode }[];
}) {
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {opciones.map((opcion) => (
          <Button
            key={opcion.id}
            type="button"
            variant={abierta === opcion.id ? "secondary" : "outline"}
            size="sm"
            aria-expanded={abierta === opcion.id}
            aria-controls={`agregar-${opcion.id}`}
            onClick={() => setAbierta((actual) => (actual === opcion.id ? null : opcion.id))}
          >
            <Plus className="size-3.5" />
            {opcion.etiqueta}
            {opcion.detalle ? (
              <span className="text-xs font-normal text-muted-foreground">({opcion.detalle})</span>
            ) : null}
          </Button>
        ))}
      </div>
      {opciones.map((opcion) => (
        <div key={opcion.id} id={`agregar-${opcion.id}`} hidden={abierta !== opcion.id}>
          {opcion.contenido}
        </div>
      ))}
    </div>
  );
}
