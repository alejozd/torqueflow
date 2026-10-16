"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { abonarCuentaPorPagarAction, type AbonoFormState } from "@/app/actions/cuenta-por-pagar-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BarraAbono, CampoMonto, ChipMonto, SelectorMetodo } from "./campos-abono";
import { PUNTO, TEXTO_VERDE, pesos, plural, type MetodoPagoAbono } from "./presentacion";

/** Lo que el diálogo necesita de la fila (ya serializable para pasar del servidor). */
export interface CuentaAbono {
  cuentaId: string;
  proveedorNombre: string;
  entradaId: string;
  /** «4 sept 2026». */
  fechaTexto: string;
  referencias: number;
  total: number;
  pagado: number;
  saldo: number;
}

type Chip = "todo" | "mitad" | "otro" | null;

const initialState: AbonoFormState = { error: null, success: false };

/**
 * Abono a una entrada (reemplaza el formulario en línea, que venía con el saldo
 * completo escrito): el monto empieza vacío, el botón dice la cifra y lo pagado
 * sigue a la vista. El diálogo ya es la confirmación.
 */
export function AbonoCuentaDialog({
  cuenta,
  open,
  onOpenChange,
}: {
  cuenta: CuentaAbono;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[500px] max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:rounded-none"
      >
        {/* La clave reinicia el formulario cada vez que se abre para otra cuenta. */}
        <FormularioAbono key={cuenta.cuentaId} cuenta={cuenta} />
      </DialogContent>
    </Dialog>
  );
}

function FormularioAbono({ cuenta }: { cuenta: CuentaAbono }) {
  const abonar = abonarCuentaPorPagarAction.bind(null, cuenta.cuentaId);
  const [state, formAction, isPending] = useActionState(abonar, initialState);
  const [monto, setMonto] = useState<number | null>(null);
  const [chip, setChip] = useState<Chip>(null);
  const [metodo, setMetodo] = useState<MetodoPagoAbono>("TRANSFERENCIA");
  const [referencia, setReferencia] = useState("");
  const campoMonto = useRef<HTMLInputElement>(null);

  const saldo = cuenta.saldo;
  const mitad = Math.round(saldo / 2);
  const queda = monto === null ? saldo : saldo - monto;
  const pagaTodo = monto !== null && queda <= 0;
  const puedeEnviar = monto !== null && monto > 0 && !isPending;

  function elegirChip(nuevo: Exclude<Chip, null>) {
    setChip(nuevo);
    if (nuevo === "todo") setMonto(saldo);
    else if (nuevo === "mitad") setMonto(mitad);
    else {
      setMonto(null);
      campoMonto.current?.focus();
    }
  }

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="monto" value={monto ?? ""} />
      <input type="hidden" name="metodoPago" value={metodo} />

      <div className="flex items-start justify-between gap-3 border-b px-4 pt-3.5 pb-2.5 sm:px-5">
        <div className="min-w-0">
          <DialogTitle className="text-base font-semibold">Abonar a {cuenta.proveedorNombre}</DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            Registra un pago que ya hiciste o vas a hacer ahora.
          </DialogDescription>
        </div>
        <DialogClose render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar" />}>
          <X aria-hidden />
        </DialogClose>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
        {/* Resumen: de qué entrada es y cuánto falta. */}
        <div className="rounded-lg bg-muted/50 px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>
              <b className="font-semibold">Entrada del {cuenta.fechaTexto}</b> ·{" "}
              {plural(cuenta.referencias, "referencia", "referencias")}
            </span>
            <Link
              href={`/entradas-mercancia/${cuenta.entradaId}`}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
            >
              Ver entrada
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <dt className="text-[11px] text-muted-foreground">Total</dt>
              <dd className="font-mono font-semibold tabular-nums">{pesos(cuenta.total)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Ya pagado</dt>
              <dd className={cn("font-mono font-semibold tabular-nums", cuenta.pagado > 0 && TEXTO_VERDE)}>
                {pesos(cuenta.pagado)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Debe</dt>
              <dd className="font-mono font-semibold text-[oklch(0.5_0.15_60)] tabular-nums">{pesos(saldo)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <CampoMonto
            id="monto-abono"
            etiqueta="¿Cuánto vas a pagar?"
            monto={monto}
            inputRef={campoMonto}
            error={null}
            onCambio={(nuevo) => {
              setMonto(nuevo);
              setChip("otro");
            }}
          />
          <div role="group" aria-label="Montos rápidos" className="mt-2 flex flex-wrap gap-1.5">
            <ChipMonto punto={PUNTO.verde} activo={chip === "todo"} onClick={() => elegirChip("todo")}>
              Pagar todo · <span className="font-mono tabular-nums">{pesos(saldo)}</span>
            </ChipMonto>
            <ChipMonto punto={PUNTO.azul} activo={chip === "mitad"} onClick={() => elegirChip("mitad")}>
              La mitad · <span className="font-mono tabular-nums">{pesos(mitad)}</span>
            </ChipMonto>
            <ChipMonto punto={PUNTO.gris} activo={chip === "otro"} onClick={() => elegirChip("otro")}>
              Otro valor
            </ChipMonto>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-semibold">¿Cómo le pagas?</span>
          <SelectorMetodo metodo={metodo} onCambio={setMetodo} />
          {metodo === "EFECTIVO" ? (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-[oklch(0.62_0.12_255/0.10)] px-2.5 py-1.5 text-xs">
              <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", PUNTO.azul)} aria-hidden />
              El dinero sale de la caja abierta y queda anotado como salida.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="referencia-abono" className="mb-1.5 block text-sm font-semibold">
            Referencia <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Input
            id="referencia-abono"
            name="referencia"
            maxLength={120}
            value={referencia}
            onChange={(evento) => setReferencia(evento.target.value)}
            placeholder={
              metodo === "TRANSFERENCIA" ? "Nro. de la transferencia, p. ej. 004581233" : "Nro. de recibo o nota"
            }
            className="h-9"
          />
        </div>

        {/* Vista previa en vivo de cómo queda la entrada. */}
        <div aria-live="polite">
          {monto === null || monto <= 0 ? (
            <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              Escribe cuánto vas a pagar o toca una de las opciones de arriba.
            </p>
          ) : pagaTodo ? (
            <div className="rounded-lg bg-[oklch(0.65_0.15_150/0.12)] px-3 py-2.5 text-sm">
              <span className={cn("font-semibold", TEXTO_VERDE)}>✓ Con este abono la entrada queda pagada.</span>
              <BarraAbono pagado={cuenta.total} abono={0} total={cuenta.total} />
            </div>
          ) : (
            <div className="rounded-lg bg-[oklch(0.75_0.15_70/0.14)] px-3 py-2.5 text-sm">
              Después de este abono le quedarás debiendo{" "}
              <b className="font-mono font-semibold tabular-nums">{pesos(queda)}</b> a {cuenta.proveedorNombre} por esta
              entrada.
              <BarraAbono pagado={cuenta.pagado} abono={monto} total={cuenta.total} />
            </div>
          )}
        </div>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/40 px-4 py-3 sm:px-5">
        <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
        <Button type="submit" disabled={!puedeEnviar}>
          {monto === null || monto <= 0
            ? "Escribe el monto"
            : pagaTodo
              ? `Pagar todo: ${pesos(saldo)}`
              : `Registrar abono de ${pesos(monto)}`}
        </Button>
      </div>
    </form>
  );
}
