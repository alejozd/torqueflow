"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { ResultadosBusquedaConceptos } from "@/lib/conceptos/buscar";
import {
  agruparConceptos,
  contarConceptos,
  esConceptoLibre,
  importeConcepto,
  type ConceptoVista,
} from "@/lib/conceptos/conceptos";
import { estadoDisponibilidad } from "@/lib/cotizacion/disponibilidad";
import { mensajeServicioAplicado } from "@/lib/servicio/mensaje-aplicado";
import type { ResultadoAccion } from "@/lib/resultado-accion";
import { textoPorcentaje } from "@/lib/iva/tarifas";
import { QuitarConConfirmacion } from "@/components/quitar-con-confirmacion";
import { SelectorIva } from "@/components/selector-iva";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BuscadorConceptos, type SeleccionBuscador } from "./buscador-conceptos";
import { CeldaEditable, interpretarCantidad, interpretarCantidadEntera, interpretarPrecio } from "./celda-editable";
import { formatoPesos, formatoUnidades } from "./formato";

export interface ResultadoConcepto {
  error: string | null;
  /** La línea creada o cambiada (para llevarle el foco). */
  conceptoId: string | null;
  /** true cuando el repuesto ya estaba suelto en la tabla y solo se le sumó 1. */
  fusionado?: boolean;
}

export interface ResultadoServicioConceptos {
  error: string | null;
  agregados: { manoDeObra: boolean; repuestos: number } | null;
}

/** Un solo campo por vez, como se edita en la celda. */
export interface CambiosConcepto {
  cantidad?: number;
  precioUnitario?: number;
  ivaPct?: number;
  descripcion?: string;
  tipo?: "REPUESTO" | "MANO_OBRA";
}

/** Lo que cada documento (cotización, orden) le da a la tabla para guardar. */
export interface AdaptadorConceptos {
  buscar(texto: string): Promise<ResultadosBusquedaConceptos>;
  agregarRepuesto(repuestoId: string): Promise<ResultadoConcepto>;
  agregarLibre(input: { tipo: "REPUESTO" | "MANO_OBRA"; descripcion: string }): Promise<ResultadoConcepto>;
  aplicarServicio(servicioId: string): Promise<ResultadoServicioConceptos>;
  actualizar(concepto: ConceptoVista, cambios: CambiosConcepto): Promise<ResultadoConcepto>;
  quitar(concepto: ConceptoVista): Promise<ResultadoAccion>;
  quitarKit(grupoKitId: string): Promise<ResultadoAccion>;
}

const DURACION_DESTELLO_MS = 1500;

const CLASE_TIPO = {
  REPUESTO: "bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.5_0.15_60)]",
  MANO_OBRA: "bg-[oklch(0.44_0.12_250/0.1)] text-[oklch(0.44_0.12_250)]",
} as const;

/**
 * Tabla de conceptos compartida por la cotización y la orden: se agrega desde el
 * buscador de arriba, cada celda se edita en el sitio y se guarda sola, y los
 * kits se ven como una fila que se despliega en sus partes. No conoce las
 * acciones de ningún documento: todo lo guarda a través de `adaptador`.
 */
export function TablaConceptos({
  adaptador,
  conceptos,
  puedeEditar,
  puedeQuitar,
  cantidadEntera = false,
  detalleFila,
  crearRepuesto,
  textoVacio,
}: {
  adaptador: AdaptadorConceptos;
  conceptos: ConceptoVista[];
  puedeEditar: boolean;
  puedeQuitar: boolean;
  /** La orden guarda cantidades enteras. */
  cantidadEntera?: boolean;
  /** Algo más bajo la descripción (la orden pone el mecánico de la mano de obra). */
  detalleFila?: (concepto: ConceptoVista) => ReactNode;
  /** Si llega, el buscador ofrece crear el repuesto en el inventario. */
  crearRepuesto?: (descripcion: string) => void;
  /** Lo que dice la tabla vacía cuando no se puede editar. */
  textoVacio: string;
}) {
  const router = useRouter();
  const buscadorRef = useRef<HTMLInputElement>(null);
  const [agregando, startAgregar] = useTransition();
  const focoPendiente = useRef<string | null>(null);
  const [destello, setDestello] = useState<string | null>(null);

  const bloques = useMemo(() => agruparConceptos(conceptos), [conceptos]);

  // Cotización vacía: lo primero que se hace es buscar, así que el cursor arranca ahí.
  const vacia = conceptos.length === 0;
  useEffect(() => {
    if (puedeEditar && vacia) buscadorRef.current?.focus();
    // Solo al montar: no robar el foco después de quitar la última línea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const conteo = contarConceptos(conceptos);

  // Los kits llegan cerrados; uno recién aplicado se abre para ver sus partes.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const kitsConocidos = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = bloques.flatMap((bloque) => (bloque.clase === "kit" ? [bloque.grupoKitId] : []));
    if (kitsConocidos.current === null) {
      kitsConocidos.current = new Set(ids);
      return;
    }
    const nuevos = ids.filter((id) => !kitsConocidos.current?.has(id));
    kitsConocidos.current = new Set(ids);
    if (nuevos.length > 0) setAbiertos((actual) => new Set([...actual, ...nuevos]));
  }, [bloques]);

  // Tras agregar, el foco va a la celda que sigue (cantidad o precio) en cuanto
  // la fila existe: puede estar ya (repuesto fusionado) o llegar con la recarga.
  function enfocarPendiente() {
    if (!focoPendiente.current) return;
    const celda = document.querySelector<HTMLInputElement>(`[data-celda="${focoPendiente.current}"]`);
    if (celda) {
      celda.focus();
      focoPendiente.current = null;
    }
  }
  useEffect(enfocarPendiente, [conceptos]);

  function pedirFoco(celda: string) {
    focoPendiente.current = celda;
    enfocarPendiente();
  }

  useEffect(() => {
    if (!destello) return;
    const temporizador = setTimeout(() => setDestello(null), DURACION_DESTELLO_MS);
    return () => clearTimeout(temporizador);
  }, [destello]);

  function alternarKit(grupoKitId: string) {
    setAbiertos((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(grupoKitId)) siguiente.delete(grupoKitId);
      else siguiente.add(grupoKitId);
      return siguiente;
    });
  }

  async function guardar(concepto: ConceptoVista, cambios: CambiosConcepto): Promise<boolean> {
    try {
      const resultado = await adaptador.actualizar(concepto, cambios);
      if (resultado.error) {
        toast.error(resultado.error);
        return false;
      }
      return true;
    } catch {
      toast.error("No se pudo guardar el cambio");
      return false;
    }
  }

  function volverAlBuscador() {
    buscadorRef.current?.focus();
  }

  function agregar(seleccion: SeleccionBuscador) {
    startAgregar(async () => {
      try {
        if (seleccion.clase === "repuesto") {
          const resultado = await adaptador.agregarRepuesto(seleccion.repuesto.id);
          if (resultado.error || !resultado.conceptoId) {
            toast.error(resultado.error ?? "No se pudo agregar el repuesto");
            return;
          }
          if (resultado.fusionado) {
            setDestello(resultado.conceptoId);
            toast.success(`Se sumó 1 a ${seleccion.repuesto.nombre}`);
          }
          pedirFoco(`${resultado.conceptoId}:cantidad`);
        } else if (seleccion.clase === "kit") {
          const resultado = await adaptador.aplicarServicio(seleccion.kit.id);
          if (resultado.error || !resultado.agregados) {
            toast.error(resultado.error ?? "No se pudo aplicar el servicio");
            return;
          }
          toast.success(mensajeServicioAplicado(resultado.agregados));
          volverAlBuscador();
        } else if (seleccion.clase === "crear") {
          crearRepuesto?.(seleccion.descripcion);
        } else {
          const resultado = await adaptador.agregarLibre({
            tipo: seleccion.tipo,
            descripcion: seleccion.descripcion,
          });
          if (resultado.error || !resultado.conceptoId) {
            toast.error(resultado.error ?? "No se pudo agregar el ítem");
            return;
          }
          pedirFoco(`${resultado.conceptoId}:precio`);
        }
      } catch {
        toast.error("No se pudo agregar. Intenta de nuevo.");
      }
    });
  }

  function filaConcepto(concepto: ConceptoVista, dentroDeKit: boolean) {
    const libre = esConceptoLibre(concepto);
    const precioModificado =
      concepto.precioCatalogo !== null && Math.abs(concepto.precioCatalogo - concepto.precioUnitario) >= 0.01;

    return (
      <tr
        key={concepto.id}
        className={cn(
          "border-b border-border transition-colors last:border-0 hover:bg-muted/50",
          dentroDeKit && "bg-primary/[0.03]",
          destello === concepto.id && "bg-primary/10",
        )}
      >
        <td className={cn("py-2 pr-2 pl-3 align-middle", dentroDeKit && "border-l-2 border-l-primary/40 pl-7")}>
          {puedeEditar && libre ? (
            <CeldaEditable
              celda={`${concepto.id}:descripcion`}
              etiqueta={`Descripción de ${concepto.descripcion}`}
              valor={concepto.descripcion}
              alinear="izquierda"
              interpretar={(texto) => (texto.trim() ? texto.trim().slice(0, 200) : null)}
              onGuardar={(nuevo) => guardar(concepto, { descripcion: nuevo })}
              onEnter={volverAlBuscador}
              className="-ml-2"
            />
          ) : (
            <p className="text-sm break-words">{concepto.descripcion}</p>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {puedeEditar && libre ? (
              <button
                type="button"
                onClick={() => void guardar(concepto, { tipo: concepto.tipo === "REPUESTO" ? "MANO_OBRA" : "REPUESTO" })}
                title="Cambiar entre repuesto y mano de obra"
                className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap", CLASE_TIPO[concepto.tipo])}
              >
                {concepto.tipo === "REPUESTO" ? "Repuesto" : "Mano de obra"} ⇄
              </button>
            ) : (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap", CLASE_TIPO[concepto.tipo])}>
                {concepto.tipo === "REPUESTO" ? "Repuesto" : "Mano de obra"}
              </span>
            )}
            {concepto.codigo ? <span className="font-mono text-[11px] text-muted-foreground">{concepto.codigo}</span> : null}
            {libre ? <span className="text-[11px] text-muted-foreground">Fuera del catálogo</span> : null}
          </div>
          {detalleFila?.(concepto)}
        </td>
        <td className="py-2 pr-2 align-middle">
          <Disponibilidad concepto={concepto} />
        </td>
        <td className="py-2 pr-1 align-middle">
          {!concepto.editableCantidad ? (
            <p className="text-center text-xs text-muted-foreground">—</p>
          ) : puedeEditar ? (
            <div className="flex items-center gap-0.5">
              {/* Con mouse la cantidad se escribe; los botones solo se muestran en pantallas táctiles. */}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Restar 1 a ${concepto.descripcion}`}
                disabled={concepto.cantidad <= 1}
                onClick={() => void guardar(concepto, { cantidad: Math.max(1, concepto.cantidad - 1) })}
                className="hidden shrink-0 pointer-coarse:inline-flex"
              >
                <Minus className="size-3.5" />
              </Button>
              <CeldaEditable
                celda={`${concepto.id}:cantidad`}
                etiqueta={`Cantidad de ${concepto.descripcion}`}
                valor={String(concepto.cantidad)}
                formato={(valor) => formatoUnidades(Number(valor))}
                interpretar={cantidadEntera ? interpretarCantidadEntera : interpretarCantidad}
                onGuardar={(nuevo) => guardar(concepto, { cantidad: Number(nuevo) })}
                onEnter={volverAlBuscador}
                className="text-center"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Sumar 1 a ${concepto.descripcion}`}
                onClick={() => void guardar(concepto, { cantidad: concepto.cantidad + 1 })}
                className="hidden shrink-0 pointer-coarse:inline-flex"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          ) : (
            <p className="text-right font-mono text-sm">{formatoUnidades(concepto.cantidad)}</p>
          )}
        </td>
        <td className="py-2 pr-1 align-middle">
          {puedeEditar ? (
            <SelectorIva
              compacto
              size="sm"
              etiqueta={`IVA de ${concepto.descripcion}`}
              value={concepto.ivaPct}
              onChange={(ivaPct) => {
                if (ivaPct !== concepto.ivaPct) void guardar(concepto, { ivaPct });
              }}
              className="w-full px-1.5 font-mono text-xs"
            />
          ) : (
            <p className="text-center font-mono text-sm text-muted-foreground">{textoPorcentaje(concepto.ivaPct)}</p>
          )}
        </td>
        <td className="py-2 pr-2 align-middle">
          {puedeEditar ? (
            <div className="flex items-center justify-end gap-0.5">
              {precioModificado && concepto.precioCatalogo !== null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={`Precio modificado. Volver al de catálogo (${formatoPesos(concepto.precioCatalogo)})`}
                  aria-label={`Volver al precio de catálogo de ${concepto.descripcion}`}
                  onClick={() => void guardar(concepto, { precioUnitario: concepto.precioCatalogo ?? 0 })}
                  className="shrink-0 text-[oklch(0.55_0.15_60)]"
                >
                  <RotateCcw className="size-3" />
                </Button>
              ) : null}
              <CeldaEditable
                celda={`${concepto.id}:precio`}
                etiqueta={`Precio unitario de ${concepto.descripcion}`}
                valor={String(concepto.precioUnitario)}
                formato={(valor) => formatoPesos(Number(valor))}
                interpretar={interpretarPrecio}
                onGuardar={(nuevo) => guardar(concepto, { precioUnitario: Number(nuevo) })}
                onEnter={volverAlBuscador}
                className="px-1"
              />
            </div>
          ) : (
            <p className="text-right font-mono text-sm text-muted-foreground">{formatoPesos(concepto.precioUnitario)}</p>
          )}
        </td>
        <td className="py-2 pr-2 text-right align-middle font-mono text-sm font-medium whitespace-nowrap">
          {formatoPesos(importeConcepto(concepto))}
        </td>
        {puedeQuitar ? (
          <td className="relative py-2 pr-1 text-right align-middle">
            <QuitarConConfirmacion
              flotante
              etiqueta={`Quitar ${concepto.descripcion}`}
              pregunta="¿Quitar este concepto?"
              accion={() => adaptador.quitar(concepto)}
              onQuitado={() => router.refresh()}
            />
          </td>
        ) : null}
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {puedeEditar ? (
        <div className="flex flex-col gap-1.5">
          <BuscadorConceptos
            ref={buscadorRef}
            buscar={adaptador.buscar}
            onSeleccionar={agregar}
            ocupado={agregando}
            permitirCrear={Boolean(crearRepuesto)}
          />
          <p className="px-1 text-xs text-muted-foreground">
            Escribe el nombre o el código y pulsa Enter. Lo que no esté en el catálogo se agrega como concepto libre.
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        {/* Anchos fijos para que el importe nunca se salga: el concepto toma lo que sobre. */}
        <table className="w-full min-w-[620px] table-fixed border-collapse text-sm">
          <colgroup>
            <col />
            <col className="w-[88px]" />
            <col className="w-[72px] pointer-coarse:w-[124px]" />
            <col className="w-[84px]" />
            <col className="w-[120px]" />
            <col className="w-[108px]" />
            {puedeQuitar ? <col className="w-10" /> : null}
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted text-left text-[11px] font-semibold tracking-wide text-foreground/60 uppercase">
              <th className="py-2 pr-2 pl-3 font-semibold">Concepto</th>
              <th className="py-2 pr-2 font-semibold" title="Existencia en bodega">
                Stock
              </th>
              <th className="py-2 pr-1 text-center font-semibold">Cant.</th>
              <th className="py-2 pr-1 text-center font-semibold">IVA</th>
              <th className="py-2 pr-2 text-right font-semibold">Precio unit.</th>
              <th className="py-2 pr-2 text-right font-semibold">Importe</th>
              {puedeQuitar ? <th aria-label="Acciones" /> : null}
            </tr>
          </thead>
          <tbody>
            {bloques.length === 0 ? (
              <tr>
                <td colSpan={puedeQuitar ? 7 : 6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {puedeEditar ? "Aún no hay conceptos. Búscalos arriba por nombre o código." : textoVacio}
                </td>
              </tr>
            ) : null}
            {bloques.map((bloque) => {
              if (bloque.clase === "suelto") return filaConcepto(bloque.concepto, false);
              const abierto = abiertos.has(bloque.grupoKitId);
              return (
                <Fragment key={bloque.grupoKitId}>
                  <tr className="border-b border-border bg-primary/[0.07]">
                    <td className="py-2 pr-2 pl-1 align-middle shadow-[inset_3px_0_0_var(--primary)]">
                      <button
                        type="button"
                        onClick={() => alternarKit(bloque.grupoKitId)}
                        aria-expanded={abierto}
                        aria-label={`${abierto ? "Cerrar" : "Abrir"} el kit ${bloque.nombre}`}
                        className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-muted"
                      >
                        <ChevronRight
                          className={cn("mt-0.5 size-4 shrink-0 text-primary transition-transform", abierto && "rotate-90")}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold break-words">{bloque.nombre}</span>
                          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-primary uppercase">
                              Kit
                            </span>
                            {bloque.conceptos.length === 1 ? "1 concepto" : `${bloque.conceptos.length} conceptos`}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td colSpan={4} className="py-2 pr-2 align-middle">
                      {bloque.sinExistencia > 0 ? (
                        <span className="flex items-center gap-1.5 text-xs leading-tight text-[oklch(0.55_0.15_60)]">
                          <span className="size-1.5 shrink-0 rounded-full bg-[oklch(0.7_0.15_60)]" />
                          {bloque.sinExistencia === 1
                            ? "Falta existencia de 1 repuesto"
                            : `Falta existencia de ${bloque.sinExistencia} repuestos`}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-right align-middle font-mono text-sm font-semibold whitespace-nowrap">
                      {formatoPesos(bloque.subtotal)}
                    </td>
                    {puedeQuitar ? (
                      <td className="relative py-2 pr-1 text-right align-middle">
                        <QuitarConConfirmacion
                          flotante
                          etiqueta={`Quitar el kit ${bloque.nombre}`}
                          pregunta={`¿Quitar el kit completo (${bloque.conceptos.length} conceptos)?`}
                          accion={() => adaptador.quitarKit(bloque.grupoKitId)}
                          onQuitado={() => router.refresh()}
                        />
                      </td>
                    ) : null}
                  </tr>
                  {abierto ? bloque.conceptos.map((concepto) => filaConcepto(concepto, true)) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {conteo.total === 1 ? "1 concepto" : `${conteo.total} conceptos`}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[oklch(0.7_0.15_60)]" />
          {conteo.repuestos === 1 ? "1 repuesto" : `${conteo.repuestos} repuestos`}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[oklch(0.44_0.12_250)]" />
          {conteo.manoDeObra} mano de obra
        </span>
      </p>
    </div>
  );
}

function Disponibilidad({ concepto }: { concepto: ConceptoVista }) {
  if (concepto.tipo !== "REPUESTO" || concepto.stockActual === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const estado = estadoDisponibilidad(concepto.stockActual, concepto.cantidad);
  const texto =
    estado === "alcanza"
      ? `${formatoUnidades(concepto.stockActual)} en bodega`
      : estado === "parcial"
        ? `Solo hay ${formatoUnidades(concepto.stockActual)}`
        : "Sin existencia";
  const color = {
    alcanza: { texto: "text-[oklch(0.5_0.12_150)]", punto: "bg-[oklch(0.6_0.15_150)]" },
    parcial: { texto: "text-[oklch(0.55_0.15_60)]", punto: "bg-[oklch(0.7_0.15_60)]" },
    agotado: { texto: "text-destructive", punto: "bg-destructive" },
  }[estado];
  return (
    <span className={cn("flex items-start gap-1.5 text-xs leading-tight", color.texto)}>
      <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", color.punto)} />
      {texto}
    </span>
  );
}
