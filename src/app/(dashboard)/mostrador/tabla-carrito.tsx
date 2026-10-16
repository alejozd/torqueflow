"use client";

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Minus, Plus, X } from "lucide-react";
import {
  buscarParaMostradorAction,
  type ResultadoRepuestoMostrador,
} from "@/app/actions/venta-mostrador-actions";
import { BuscadorConceptos, type OpcionBuscador } from "@/components/buscador-conceptos";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { estadoDisponibilidad } from "@/lib/cotizacion/disponibilidad";
import { cn } from "@/lib/utils";
import type { Carrito, LineaCarrito } from "./use-carrito";

const SIN_RESULTADOS: ResultadoRepuestoMostrador[] = [];

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const COLOR_CHIP = {
  alcanza: { texto: "text-[oklch(0.5_0.12_150)]", punto: "bg-[oklch(0.6_0.15_150)]" },
  parcial: { texto: "text-[oklch(0.55_0.15_60)]", punto: "bg-[oklch(0.7_0.15_60)]" },
  agotado: { texto: "text-destructive", punto: "bg-destructive" },
} as const;

/** Chip del buscador y de la fila: verde si hay de sobra, ámbar al llegar al tope, rojo sin unidades. */
function ChipDisponibilidad({ disponible, cantidad }: { disponible: number; cantidad: number }) {
  // Se mide contra "una más": al llegar al tope ya no cabe otra y el chip pasa a ámbar.
  const estado = estadoDisponibilidad(disponible, cantidad + 1);
  const texto =
    estado === "alcanza" ? `${disponible} disponibles` : estado === "parcial" ? `Solo hay ${disponible}` : "Sin unidades libres";
  const color = COLOR_CHIP[estado];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs leading-tight", color.texto)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", color.punto)} aria-hidden />
      {texto}
    </span>
  );
}

function unidades(n: number) {
  return `${n} ${n === 1 ? "unidad" : "unidades"}`;
}

/**
 * Carrito del mostrador: filas con chip de disponibilidad, − / + con tope y
 * quitar con confirmación en línea; el buscador es la última fila. Todo se
 * maneja con teclado (spec §4.4): ↑ desde el buscador baja a la última fila,
 * `+` / `−` cambian la cantidad, Supr quita (Enter confirma, Esc cancela).
 */
export function TablaCarrito({
  carrito,
  buscadorRef,
}: {
  carrito: Carrito;
  buscadorRef?: RefObject<HTMLInputElement | null>;
}) {
  const { lineas, agregarRepuesto, agregarLibre, cambiarCantidad, quitar, vaciar, totalProductos, totalUnidades } = carrito;
  const internoRef = useRef<HTMLInputElement | null>(null);
  const filas = useRef(new Map<string, HTMLTableRowElement>());
  /** Tab pulsado desde que se abrió la confirmación: Enter deja de significar "confirmar". */
  const tabulado = useRef(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);
  const [libreAbierta, setLibreAbierta] = useState(false);
  const [libreDescripcion, setLibreDescripcion] = useState("");
  const [librePrecio, setLibrePrecio] = useState("");

  // El buscador arranca con el foco: se escanea o se escribe sin tocar nada.
  useEffect(() => {
    internoRef.current?.focus();
  }, []);

  function asignarBuscador(el: HTMLInputElement | null) {
    internoRef.current = el;
    if (buscadorRef) buscadorRef.current = el;
  }

  function enfocarBuscador() {
    internoRef.current?.focus();
  }

  function enfocarFila(id: string | undefined) {
    if (id) filas.current.get(id)?.focus();
  }

  function enCarrito(repuestoId: string): number {
    return lineas.find((linea) => linea.repuestoId === repuestoId)?.cantidad ?? 0;
  }

  function aOpciones(resultados: ResultadoRepuestoMostrador[]): OpcionBuscador<ResultadoRepuestoMostrador>[] {
    return resultados.map((repuesto) => {
      const libres = repuesto.disponible - enCarrito(repuesto.id);
      return {
        clave: repuesto.id,
        valor: repuesto,
        noDisponible: libres > 0 ? undefined : "Sin unidades libres: no se puede agregar",
        contenido: (
          <>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{repuesto.nombre}</span>{" "}
              <span className="font-mono text-muted-foreground">{repuesto.codigo}</span>
            </span>
            <ChipDisponibilidad disponible={libres} cantidad={0} />
            <span className="shrink-0 font-mono">{formatoMoneda.format(repuesto.precioVenta)}</span>
          </>
        ),
      };
    });
  }

  function abrirConfirmacion(id: string) {
    tabulado.current = false;
    setConfirmando(id);
  }

  function onKeyDownFila(event: KeyboardEvent<HTMLTableRowElement>, linea: LineaCarrito, indice: number) {
    // No se roba lo que se teclea en un campo.
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      cambiarCantidad(linea.id, linea.cantidad + 1);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      cambiarCantidad(linea.id, linea.cantidad - 1);
    } else if (event.key === "Delete") {
      event.preventDefault();
      abrirConfirmacion(linea.id);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      enfocarFila(lineas[indice - 1]?.id);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (indice === lineas.length - 1) enfocarBuscador();
      else enfocarFila(lineas[indice + 1]?.id);
    }
  }

  function confirmarQuitar(id: string) {
    quitar(id);
    setConfirmando(null);
    enfocarBuscador();
  }

  function cancelarQuitar(id: string) {
    setConfirmando(null);
    // El foco vuelve a la fila cuando la confirmación ya desapareció.
    setTimeout(() => enfocarFila(id), 0);
  }

  function confirmarVaciar() {
    vaciar();
    setConfirmandoVaciar(false);
    enfocarBuscador();
  }

  function agregarLineaLibre() {
    const precio = Number(librePrecio);
    if (libreDescripcion.trim() === "" || librePrecio === "" || !Number.isFinite(precio) || precio < 0) return;
    agregarLibre(libreDescripcion, precio);
    setLibreDescripcion("");
    setLibrePrecio("");
    setLibreAbierta(false);
    enfocarBuscador();
  }

  /**
   * Enter confirma mientras el foco sigue en la opción segura ("No") y no se ha
   * pulsado Tab; Esc cancela. Tras un Tab, Enter vuelve a ser el del botón enfocado.
   */
  function teclasConfirmacion(event: KeyboardEvent<HTMLDivElement>, aceptar: () => void, cancelar: () => void) {
    if (event.key === "Tab") tabulado.current = true;
    else if (event.key === "Escape") {
      event.preventDefault();
      cancelar();
    } else if (event.key === "Enter" && !tabulado.current) {
      event.preventDefault();
      aceptar();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="w-44 px-3 py-2 font-medium">Cantidad</th>
              <th className="w-28 px-3 py-2 text-right font-medium">Precio</th>
              <th className="w-28 px-3 py-2 text-right font-medium">Importe</th>
              <th className="w-10 px-3 py-2">
                <span className="sr-only">Quitar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((linea, indice) => {
              const tope = linea.disponible !== null && linea.cantidad >= linea.disponible;
              return (
                <Fragment key={linea.id}>
                  <tr
                    ref={(el) => {
                      if (el) filas.current.set(linea.id, el);
                      else filas.current.delete(linea.id);
                    }}
                    tabIndex={0}
                    aria-label={linea.descripcion}
                    onKeyDown={(event) => onKeyDownFila(event, linea, indice)}
                    className="border-b outline-none focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{linea.descripcion}</div>
                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        {linea.codigo ? <span className="font-mono">{linea.codigo}</span> : <span>Línea libre</span>}
                        {linea.disponible !== null ? (
                          <ChipDisponibilidad disponible={linea.disponible} cantidad={linea.cantidad} />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-8"
                          aria-label={`Menos ${linea.descripcion}`}
                          disabled={linea.cantidad <= 1}
                          onClick={() => cambiarCantidad(linea.id, linea.cantidad - 1)}
                        >
                          <Minus className="size-3.5" aria-hidden />
                        </Button>
                        <span className="w-8 text-center font-mono" aria-label={`Cantidad de ${linea.descripcion}`}>
                          {linea.cantidad}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-8"
                          aria-label={`Más ${linea.descripcion}`}
                          disabled={tope}
                          onClick={() => cambiarCantidad(linea.id, linea.cantidad + 1)}
                        >
                          <Plus className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatoMoneda.format(linea.precioUnitario)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatoMoneda.format(linea.cantidad * linea.precioUnitario)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label={`Quitar ${linea.descripcion}`}
                        onClick={() => abrirConfirmacion(linea.id)}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                  {confirmando === linea.id ? (
                    <tr className="border-b bg-destructive/5">
                      <td colSpan={5} className="px-3 py-2">
                        <div
                          onKeyDown={(event) =>
                            teclasConfirmacion(
                              event,
                              () => confirmarQuitar(linea.id),
                              () => cancelarQuitar(linea.id),
                            )
                          }
                        >
                          <ConfirmacionEnLinea
                            pregunta={`¿Quitar ${linea.descripcion} del carrito?`}
                            etiquetaConfirmar="Sí, quitar"
                            onConfirmar={() => confirmarQuitar(linea.id)}
                            onCancelar={() => cancelarQuitar(linea.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {lineas.length === 0 ? (
              <tr className="border-b">
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Escanea el código o escribe el nombre del repuesto
                </td>
              </tr>
            ) : null}
            <tr>
              <td colSpan={5} className="px-3 py-2">
                <BuscadorConceptos<ResultadoRepuestoMostrador[], ResultadoRepuestoMostrador>
                  buscar={buscarParaMostradorAction}
                  vacio={SIN_RESULTADOS}
                  aOpciones={aOpciones}
                  onSeleccionar={agregarRepuesto}
                  placeholder="Escanea o escribe código / nombre… (F1)"
                  etiqueta="Buscar repuesto"
                  inputRef={asignarBuscador}
                  onFlechaArriba={() => enfocarFila(lineas[lineas.length - 1]?.id)}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {libreAbierta ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            agregarLineaLibre();
          }}
        >
          <Input
            aria-label="Descripción de la línea libre"
            placeholder="Descripción (p. ej. Mano de obra)"
            className="w-64"
            autoFocus
            value={libreDescripcion}
            onChange={(event) => setLibreDescripcion(event.target.value)}
          />
          <Input
            aria-label="Precio de la línea libre"
            type="number"
            min={0}
            step="any"
            placeholder="Precio"
            className="w-32 font-mono"
            value={librePrecio}
            onChange={(event) => setLibrePrecio(event.target.value)}
          />
          <Button type="submit" size="sm">
            Agregar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setLibreAbierta(false)}>
            Cancelar
          </Button>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          {confirmandoVaciar ? (
            <div
              onKeyDown={(event) =>
                teclasConfirmacion(event, confirmarVaciar, () => {
                  setConfirmandoVaciar(false);
                  enfocarBuscador();
                })
              }
            >
              <ConfirmacionEnLinea
                pregunta="¿Vaciar todo el carrito?"
                etiquetaConfirmar="Sí, vaciar"
                onConfirmar={confirmarVaciar}
                onCancelar={() => {
                  setConfirmandoVaciar(false);
                  enfocarBuscador();
                }}
              />
            </div>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={lineas.length === 0}
                onClick={() => {
                  tabulado.current = false;
                  setConfirmandoVaciar(true);
                }}
              >
                Vaciar carrito
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setLibreAbierta((v) => !v)}>
                Agregar línea libre
              </Button>
            </>
          )}
        </div>
        <p data-testid="pie-carrito">
          {totalProductos} {totalProductos === 1 ? "producto" : "productos"} · {unidades(totalUnidades)}
        </p>
      </div>
    </div>
  );
}
