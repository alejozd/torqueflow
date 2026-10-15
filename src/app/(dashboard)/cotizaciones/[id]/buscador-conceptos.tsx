"use client";

import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Package, Plus, Search, Wrench } from "lucide-react";
import {
  buscarParaCotizacionAction,
  type ResultadoKitBusqueda,
  type ResultadoRepuestoBusqueda,
  type ResultadosBusquedaCotizacion,
} from "@/app/actions/buscar-cotizacion-actions";
import { estadoDisponibilidad } from "@/lib/cotizacion/disponibilidad";
import { cn } from "@/lib/utils";
import { formatoPesos } from "./formato";

export type SeleccionBuscador =
  | { clase: "kit"; kit: ResultadoKitBusqueda }
  | { clase: "repuesto"; repuesto: ResultadoRepuestoBusqueda }
  | { clase: "libre"; tipo: "REPUESTO" | "MANO_OBRA"; descripcion: string };

type Opcion = SeleccionBuscador & { clave: string };

const ESPERA_MS = 200;
const VACIO: ResultadosBusquedaCotizacion = { kits: [], repuestos: [] };

/**
 * Línea de captura de la tabla de conceptos: un solo campo para kits,
 * repuestos del inventario e ítems libres. Flechas para moverse, Enter para
 * agregar, Esc para cerrar.
 */
export const BuscadorConceptos = forwardRef<
  HTMLInputElement,
  { onSeleccionar: (seleccion: SeleccionBuscador) => void; ocupado?: boolean }
>(function BuscadorConceptos({ onSeleccionar, ocupado = false }, ref) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<ResultadosBusquedaCotizacion>(VACIO);
  /** Texto al que corresponden los resultados mostrados; si difiere del escrito, se está buscando. */
  const [textoBuscado, setTextoBuscado] = useState<string | null>(null);
  const [activa, setActiva] = useState(0);
  const ultimaBusqueda = useRef(0);
  const listaId = useId();
  const buscando = abierto && textoBuscado !== texto;

  useEffect(() => {
    if (!abierto) return;
    const numero = ++ultimaBusqueda.current;
    const temporizador = setTimeout(async () => {
      let encontrados = VACIO;
      try {
        encontrados = await buscarParaCotizacionAction(texto);
      } catch {
        // Sin resultados: el usuario aún puede agregar lo escrito como ítem libre.
      }
      // Una respuesta lenta de una búsqueda vieja no pisa la más reciente.
      if (numero === ultimaBusqueda.current) {
        setResultados(encontrados);
        setTextoBuscado(texto);
      }
    }, ESPERA_MS);
    return () => clearTimeout(temporizador);
  }, [texto, abierto]);

  const descripcionLibre = texto.trim();
  const opciones: Opcion[] = [
    ...resultados.kits.map((kit) => ({ clase: "kit" as const, kit, clave: `kit-${kit.id}` })),
    ...resultados.repuestos.map((repuesto) => ({ clase: "repuesto" as const, repuesto, clave: `rep-${repuesto.id}` })),
    ...(descripcionLibre
      ? [
          { clase: "libre" as const, tipo: "REPUESTO" as const, descripcion: descripcionLibre, clave: "libre-repuesto" },
          { clase: "libre" as const, tipo: "MANO_OBRA" as const, descripcion: descripcionLibre, clave: "libre-mano" },
        ]
      : []),
  ];
  const indiceActivo = Math.min(activa, Math.max(opciones.length - 1, 0));

  function elegir(opcion: Opcion) {
    setTexto("");
    setActiva(0);
    setAbierto(false);
    setResultados(VACIO);
    setTextoBuscado(null);
    onSeleccionar(opcion);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAbierto(true);
      setActiva((i) => Math.min(i + 1, opciones.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiva((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const opcion = opciones[indiceActivo];
      if (abierto && opcion && !ocupado) elegir(opcion);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setAbierto(false);
      setTexto("");
    }
  }

  const mostrarLista = abierto && (opciones.length > 0 || buscando);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 focus-within:border-ring focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/30">
        {ocupado ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <input
          ref={ref}
          type="text"
          role="combobox"
          aria-label="Agregar repuesto, servicio o kit"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={mostrarLista && opciones[indiceActivo] ? `${listaId}-${opciones[indiceActivo].clave}` : undefined}
          placeholder="Agregar repuesto, servicio o kit…"
          value={texto}
          onChange={(event) => {
            setTexto(event.target.value);
            setActiva(0);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
          onKeyDown={onKeyDown}
          className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {mostrarLista ? (
        <ul
          id={listaId}
          role="listbox"
          aria-label="Resultados"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {opciones.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Buscando…</li>
          ) : null}
          {opciones.map((opcion, indice) => {
            const primeraDeSeccion = indice === 0 || opciones[indice - 1].clase !== opcion.clase;
            return (
              <li key={opcion.clave} role="presentation">
                {primeraDeSeccion ? <TituloSeccion clase={opcion.clase} /> : null}
                <div
                  id={`${listaId}-${opcion.clave}`}
                  role="option"
                  aria-selected={indice === indiceActivo}
                  // mousedown y no click: el blur del campo cerraría la lista antes del click.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    if (!ocupado) elegir(opcion);
                  }}
                  onMouseEnter={() => setActiva(indice)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm",
                    indice === indiceActivo && "bg-accent text-accent-foreground",
                  )}
                >
                  <ContenidoOpcion opcion={opcion} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

function TituloSeccion({ clase }: { clase: Opcion["clase"] }) {
  const titulo = clase === "kit" ? "Kits y servicios" : clase === "repuesto" ? "Repuestos" : "No está en el catálogo";
  return (
    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{titulo}</p>
  );
}

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
