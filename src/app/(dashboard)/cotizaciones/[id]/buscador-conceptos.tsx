"use client";

import { forwardRef } from "react";
import { Package, Plus, Wrench } from "lucide-react";
import {
  buscarParaCotizacionAction,
  type ResultadoKitBusqueda,
  type ResultadoRepuestoBusqueda,
  type ResultadosBusquedaCotizacion,
} from "@/app/actions/buscar-cotizacion-actions";
import { BuscadorConceptos as BuscadorCompartido, type OpcionBuscador } from "@/components/buscador-conceptos";
import { estadoDisponibilidad } from "@/lib/cotizacion/disponibilidad";
import { cn } from "@/lib/utils";
import { formatoPesos } from "./formato";

export type SeleccionBuscador =
  | { clase: "kit"; kit: ResultadoKitBusqueda }
  | { clase: "repuesto"; repuesto: ResultadoRepuestoBusqueda }
  | { clase: "libre"; tipo: "REPUESTO" | "MANO_OBRA"; descripcion: string };

type Opcion = SeleccionBuscador;

const VACIO: ResultadosBusquedaCotizacion = { kits: [], repuestos: [] };

function aOpciones({ kits, repuestos }: ResultadosBusquedaCotizacion, texto: string): OpcionBuscador<SeleccionBuscador>[] {
  const descripcionLibre = texto.trim();
  const construir = (valor: SeleccionBuscador, clave: string, seccion: string): OpcionBuscador<SeleccionBuscador> => ({
    clave,
    valor,
    seccion,
    contenido: <ContenidoOpcion opcion={valor} />,
  });
  return [
    ...kits.map((kit) => construir({ clase: "kit", kit }, `kit-${kit.id}`, "Kits y servicios")),
    ...repuestos.map((repuesto) => construir({ clase: "repuesto", repuesto }, `rep-${repuesto.id}`, "Repuestos")),
    ...(descripcionLibre
      ? [
          construir({ clase: "libre", tipo: "REPUESTO", descripcion: descripcionLibre }, "libre-repuesto", "No está en el catálogo"),
          construir({ clase: "libre", tipo: "MANO_OBRA", descripcion: descripcionLibre }, "libre-mano", "No está en el catálogo"),
        ]
      : []),
  ];
}

/**
 * Línea de captura de la tabla de conceptos: un solo campo para kits,
 * repuestos del inventario e ítems libres. Usa el buscador compartido con el
 * mostrador; aquí solo se pone la búsqueda y el pintado de cada resultado.
 */
export const BuscadorConceptos = forwardRef<
  HTMLInputElement,
  { onSeleccionar: (seleccion: SeleccionBuscador) => void; ocupado?: boolean }
>(function BuscadorConceptos({ onSeleccionar, ocupado = false }, ref) {
  return (
    <BuscadorCompartido<ResultadosBusquedaCotizacion, SeleccionBuscador>
      inputRef={ref}
      buscar={buscarParaCotizacionAction}
      vacio={VACIO}
      aOpciones={aOpciones}
      onSeleccionar={onSeleccionar}
      ocupado={ocupado}
      placeholder="Agregar repuesto, servicio o kit…"
      etiqueta="Agregar repuesto, servicio o kit"
    />
  );
});

function ContenidoOpcion({ opcion }: { opcion: Opcion }) {
  if (opcion.clase === "kit") {
    const { kit } = opcion;
    return (
      <>
        <Wrench className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {kit.nombre}
          <span className="ml-2 text-xs text-muted-foreground">
            {kit.conceptos === 1 ? "1 concepto" : `kit · ${kit.conceptos} conceptos`}
          </span>
          {kit.repuestosSinExistencia > 0 ? (
            <span className="ml-2 text-xs text-[oklch(0.55_0.15_60)]">
              {kit.repuestosSinExistencia === 1 ? "1 repuesto sin existencia" : `${kit.repuestosSinExistencia} repuestos sin existencia`}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 font-mono text-xs">{formatoPesos(kit.total)}</span>
      </>
    );
  }
  if (opcion.clase === "repuesto") {
    const { repuesto } = opcion;
    return (
      <>
        <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {repuesto.nombre}
          <span className="ml-2 font-mono text-xs text-muted-foreground">{repuesto.codigo}</span>
        </span>
        <Existencia stockActual={repuesto.stockActual} />
        <span className="w-24 shrink-0 text-right font-mono text-xs">{formatoPesos(repuesto.precioVenta)}</span>
      </>
    );
  }
  return (
    <>
      <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        Agregar «{opcion.descripcion}» como {opcion.tipo === "REPUESTO" ? "repuesto" : "mano de obra"}
      </span>
    </>
  );
}

function Existencia({ stockActual }: { stockActual: number }) {
  const estado = estadoDisponibilidad(stockActual, 1);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 text-xs",
        estado === "agotado" ? "text-destructive" : "text-[oklch(0.5_0.12_150)]",
      )}
    >
      <span className={cn("size-1.5 rounded-full", estado === "agotado" ? "bg-destructive" : "bg-[oklch(0.6_0.15_150)]")} />
      {estado === "agotado" ? "Sin existencia" : `${stockActual} en bodega`}
    </span>
  );
}
