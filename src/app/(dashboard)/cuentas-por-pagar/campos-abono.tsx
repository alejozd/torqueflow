"use client";

import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";
import { METODOS_PAGO, type MetodoPagoAbono } from "./presentacion";

/**
 * Piezas comunes de los dos diálogos de abono (a una entrada y al proveedor):
 * el campo de monto con separador de miles, los botones rápidos y el método.
 */

const formatoMiles = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** Lo escrito queda solo en dígitos (pesos enteros); 12 cifras sobran para cualquier compra. */
export function montoDesdeTexto(texto: string): number | null {
  const digitos = texto.replace(/\D/g, "").slice(0, 12);
  return digitos === "" ? null : Number(digitos);
}

export function CampoMonto({
  id,
  etiqueta,
  monto,
  onCambio,
  error,
  inputRef,
}: {
  id: string;
  etiqueta: string;
  monto: number | null;
  onCambio: (monto: number | null) => void;
  error: string | null;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const idError = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {etiqueta}
      </label>
      <div
        className={cn(
          "flex h-11 items-center rounded-lg border bg-background px-3 transition-shadow focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15",
          error && "border-destructive focus-within:border-destructive focus-within:ring-destructive/15",
        )}
      >
        <span className="mr-1.5 text-lg text-muted-foreground" aria-hidden>
          $
        </span>
        <input
          ref={inputRef}
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={monto === null ? "" : formatoMiles.format(monto)}
          onChange={(evento) => onCambio(montoDesdeTexto(evento.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          className="w-full bg-transparent font-mono text-xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      {error ? (
        <p id={idError} className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Botón rápido de monto: siempre con su punto de color. */
export function ChipMonto({
  punto,
  activo,
  onClick,
  children,
}: {
  punto: string;
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs transition-colors hover:border-foreground/20 hover:bg-muted/60",
        activo && "border-primary bg-primary/10 font-semibold text-primary hover:border-primary hover:bg-primary/15",
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", punto)} aria-hidden />
      {children}
    </button>
  );
}

/** Los cuatro métodos como botones segmentados (sin select): se ven todos de un vistazo. */
export function SelectorMetodo({
  metodo,
  onCambio,
}: {
  metodo: MetodoPagoAbono;
  onCambio: (metodo: MetodoPagoAbono) => void;
}) {
  return (
    <div role="group" aria-label="Método de pago" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {METODOS_PAGO.map((opcion) => (
        <button
          key={opcion.valor}
          type="button"
          aria-pressed={metodo === opcion.valor}
          onClick={() => onCambio(opcion.valor)}
          className={cn(
            "cursor-pointer rounded-lg border bg-card px-1 py-2 text-xs transition-colors hover:bg-muted/60",
            metodo === opcion.valor && "border-primary bg-primary/10 font-semibold text-primary hover:bg-primary/15",
          )}
        >
          {opcion.etiqueta}
        </button>
      ))}
    </div>
  );
}

/** Barra de pagado (verde) más lo que agrega este abono (verde claro). */
export function BarraAbono({ pagado, abono, total }: { pagado: number; abono: number; total: number }) {
  const ya = total > 0 ? Math.min(100, (pagado / total) * 100) : 100;
  const suma = total > 0 ? Math.min(100 - ya, (abono / total) * 100) : 0;
  return (
    <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-foreground/[0.07]" aria-hidden>
      <div className="absolute inset-y-0 left-0 rounded-full bg-[oklch(0.6_0.17_150)]" style={{ width: `${ya}%` }} />
      <div
        className="absolute inset-y-0 rounded-full bg-[oklch(0.6_0.17_150/0.45)]"
        style={{ left: `${ya}%`, width: `${suma}%` }}
      />
    </div>
  );
}
