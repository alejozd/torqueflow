"use client";

import type { ComponentProps, ReactNode, Ref } from "react";
import { Input } from "@/components/ui/input";
import { porcentajeDescuento } from "@/lib/mostrador/cobro";
import { cn } from "@/lib/utils";

export type TipoDescuento = "PORCENTAJE" | "MONTO";

/**
 * Campo de descuento comercial por porcentaje o por monto fijo en pesos, con el
 * selector %/$. Es solo la apariencia: la cotización lo usa dentro de un
 * formulario que guarda (`descuento-cotizacion-form.tsx`) y el mostrador en
 * estado local (`EditorDescuentoLocal`), porque allí no hay venta hasta cobrar.
 */
export function CampoDescuento({
  tipo,
  onTipoChange,
  etiqueta = "Descuento comercial",
  inputId = "descuento-valor",
  campoKey,
  campo,
  inputRef,
  accion,
  pie,
}: {
  tipo: TipoDescuento;
  onTipoChange: (tipo: TipoDescuento) => void;
  etiqueta?: string;
  inputId?: string;
  /** Para reiniciar un campo no controlado (la cotización muestra el último valor guardado de cada tipo). */
  campoKey?: string;
  campo: Omit<ComponentProps<typeof Input>, "id" | "type" | "ref">;
  inputRef?: Ref<HTMLInputElement>;
  /** Botón a la derecha del campo ("Aplicar" en la cotización). */
  accion?: ReactNode;
  /** Debajo del campo: error, tope del rol, etc. */
  pie?: ReactNode;
}) {
  const esPorcentaje = tipo === "PORCENTAJE";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm text-muted-foreground">
          {etiqueta}
        </label>
        <div role="group" aria-label="Tipo de descuento" className="flex rounded-md border border-border p-0.5">
          {(["PORCENTAJE", "MONTO"] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              aria-pressed={tipo === opcion}
              aria-label={opcion === "PORCENTAJE" ? "Descuento por porcentaje" : "Descuento por monto fijo"}
              onClick={() => onTipoChange(opcion)}
              className={cn(
                "min-w-8 rounded px-2 py-0.5 text-xs font-semibold transition-colors",
                tipo === opcion ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {opcion === "PORCENTAJE" ? "%" : "$"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          {!esPorcentaje ? (
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          ) : null}
          <Input
            key={campoKey}
            ref={inputRef}
            id={inputId}
            type="number"
            inputMode="decimal"
            min="0"
            max={esPorcentaje ? "100" : undefined}
            step={esPorcentaje ? "0.01" : "1"}
            {...campo}
            className={cn("font-mono", esPorcentaje ? "pr-7" : "pl-6", campo.className)}
          />
          {esPorcentaje ? (
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          ) : null}
        </div>
        {accion}
      </div>
      {pie}
    </div>
  );
}

/** Descuento local del mostrador: el tipo y el texto tal como los escribió el usuario. */
export interface DescuentoLocal {
  tipo: TipoDescuento;
  valor: string;
}

export const DESCUENTO_VACIO: DescuentoLocal = { tipo: "PORCENTAJE", valor: "" };

/**
 * Monto del descuento en pesos. El porcentaje se trunca al centavo: redondear
 * hacia arriba podría pasar el tope por una fracción y el servidor lo rechazaría.
 */
export function montoDescuento(subtotal: number, descuento: DescuentoLocal): number {
  const valor = Number(descuento.valor);
  if (!Number.isFinite(valor) || valor <= 0 || subtotal <= 0) return 0;
  if (descuento.tipo === "MONTO") return Math.round(valor * 100) / 100;
  return Math.floor(subtotal * valor + 1e-6) / 100;
}

export interface EvaluacionDescuento {
  monto: number;
  porcentaje: number;
  /** Motivo por el que no se puede cobrar con este descuento, o `null`. */
  error: string | null;
}

/** Monto, porcentaje y si el rol puede darlo (`tope` = null: sin tope, ADMIN). */
export function evaluarDescuento(subtotal: number, descuento: DescuentoLocal, tope: number | null): EvaluacionDescuento {
  const monto = montoDescuento(subtotal, descuento);
  const porcentaje = porcentajeDescuento(subtotal, monto);
  let error: string | null = null;
  if (monto > subtotal) error = "El descuento no puede ser mayor que el subtotal";
  else if (tope !== null && porcentaje > tope) error = `Tu descuento máximo es ${tope} %`;
  return { monto, porcentaje, error };
}

/**
 * Editor de descuento del mostrador: la misma UI %/$ de la cotización, pero sin
 * guardar nada; el monto viaja al servidor al cobrar. Con tope (RECEPCION)
 * muestra "Máximo N %" y avisa si se pasa (el servidor también lo bloquea).
 */
export function EditorDescuentoLocal({
  descuento,
  onCambiar,
  tope,
  error,
  inputRef,
}: {
  descuento: DescuentoLocal;
  onCambiar: (descuento: DescuentoLocal) => void;
  tope: number | null;
  error: string | null;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <CampoDescuento
      tipo={descuento.tipo}
      onTipoChange={(tipo) => onCambiar({ tipo, valor: "" })}
      etiqueta="Descuento"
      inputId="descuento-mostrador"
      inputRef={inputRef}
      campo={{
        value: descuento.valor,
        placeholder: "0",
        onChange: (evento) => onCambiar({ ...descuento, valor: evento.target.value }),
        max: descuento.tipo === "PORCENTAJE" ? String(tope ?? 100) : undefined,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": "descuento-mostrador-ayuda",
      }}
      pie={
        <p id="descuento-mostrador-ayuda" className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          {error ?? (tope !== null ? `Máximo ${tope} %` : null)}
        </p>
      }
    />
  );
}
