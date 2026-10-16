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
  version = 0,
  cajaAbierta,
  open,
  onOpenChange,
  onOtroAbono,
}: {
  cuenta: CuentaAbono;
  /** Sube con «Hacer otro abono» para empezar el formulario de cero. */
  version?: number;
  /** La página ya sabe si la caja está cerrada: se avisa antes de enviar. */
  cajaAbierta: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** «Hacer otro abono»: la misma cuenta con lo que quedó debiendo. */
  onOtroAbono: (cuenta: CuentaAbono) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[500px] max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:rounded-none"
      >
        {/* La clave reinicia el formulario cada vez que se abre para otra cuenta. */}
        <FormularioAbono
          key={`${cuenta.cuentaId}-${version}`}
          cuenta={cuenta}
          cajaAbierta={cajaAbierta}
          onListo={() => onOpenChange(false)}
          onOtroAbono={onOtroAbono}
        />
      </DialogContent>
    </Dialog>
  );
}

function FormularioAbono({
  cuenta,
  cajaAbierta,
  onListo,
  onOtroAbono,
}: {
  cuenta: CuentaAbono;
  cajaAbierta: boolean;
  onListo: () => void;
  onOtroAbono: (cuenta: CuentaAbono) => void;
}) {
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
  const excede = monto !== null && monto > saldo;
  const pagaTodo = monto !== null && !excede && queda <= 0;
  // La caja cerrada se avisa antes de enviar; el error del servidor sigue siendo la
  // protección final (alguien pudo cerrarla mientras el diálogo estaba abierto).
  const errorDeCaja = state.error !== null && /caja/i.test(state.error);
  const efectivoBloqueado = metodo === "EFECTIVO" && (!cajaAbierta || errorDeCaja);
  const puedeEnviar = monto !== null && monto > 0 && !excede && !efectivoBloqueado && !isPending;

  if (state.success) {
    const registrado = monto ?? 0;
    const restante = Math.max(0, saldo - registrado);
    return (
      <ExitoAbono
        cuenta={cuenta}
        montoRegistrado={registrado}
        saldoRestante={restante}
        metodo={metodo}
        referencia={referencia.trim()}
        onListo={onListo}
        onOtroAbono={() => onOtroAbono({ ...cuenta, pagado: cuenta.pagado + registrado, saldo: restante })}
      />
    );
  }

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
            error={excede ? `No puedes abonar más de lo que se debe (${pesos(saldo)}).` : null}
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
          {efectivoBloqueado ? (
            <div
              role="alert"
              className="mt-2 flex items-start gap-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
            >
              <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", PUNTO.rojo)} aria-hidden />
              <span>
                {errorDeCaja && state.error
                  ? `${state.error}, o elige otro método.`
                  : "La caja está cerrada. Ábrela antes de pagar en efectivo a un proveedor, o elige otro método."}{" "}
                <Link href="/caja" className="font-semibold underline-offset-2 hover:underline">
                  Abrir caja →
                </Link>
              </span>
            </div>
          ) : metodo === "EFECTIVO" ? (
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
          {excede ? null : monto === null || monto <= 0 ? (
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

        {state.error && !errorDeCaja ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/40 px-4 py-3 sm:px-5">
        <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
        <Button type="submit" disabled={!puedeEnviar}>
          {isPending
            ? "Registrando…"
            : monto === null || monto <= 0
              ? "Escribe el monto"
              : pagaTodo
                ? `Pagar todo: ${pesos(saldo)}`
                : `Registrar abono de ${pesos(monto)}`}
        </Button>
      </div>
    </form>
  );
}

const METODO_EN_FRASE: Record<MetodoPagoAbono, string> = {
  TRANSFERENCIA: "transferencia",
  EFECTIVO: "efectivo",
  TARJETA: "tarjeta",
  OTRO: "otro método",
};

/** El contenido del diálogo después de registrar: qué se pagó y cómo quedó la entrada. */
function ExitoAbono({
  cuenta,
  montoRegistrado,
  saldoRestante,
  metodo,
  referencia,
  onListo,
  onOtroAbono,
}: {
  cuenta: CuentaAbono;
  montoRegistrado: number;
  saldoRestante: number;
  metodo: MetodoPagoAbono;
  referencia: string;
  onListo: () => void;
  onOtroAbono: () => void;
}) {
  const pagada = saldoRestante <= 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="status" className="flex flex-1 flex-col items-center justify-center px-5 pt-6 pb-4 text-center">
        {/* ✓ verde vivo, sin círculo. */}
        <span className={cn("text-5xl leading-none font-bold", TEXTO_VERDE)} aria-hidden>
          ✓
        </span>
        <DialogTitle className="mt-2 text-lg font-semibold">Abono registrado</DialogTitle>
        <DialogDescription className="mt-1 text-sm">
          <b className="font-mono font-semibold text-foreground tabular-nums">{pesos(montoRegistrado)}</b> a{" "}
          {cuenta.proveedorNombre} por {METODO_EN_FRASE[metodo]}
          {referencia ? ` · ref. ${referencia}` : ""}
        </DialogDescription>
        <p className="mt-1 text-sm text-muted-foreground">
          {pagada ? (
            <>
              La entrada del {cuenta.fechaTexto} quedó <b className={cn("font-semibold", TEXTO_VERDE)}>pagada</b>. La
              encuentras en «Pagadas».
            </>
          ) : (
            <>
              De la entrada del {cuenta.fechaTexto} todavía debes{" "}
              <b className="font-mono font-semibold text-foreground tabular-nums">{pesos(saldoRestante)}</b>.
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 border-t bg-muted/40 px-4 py-3 sm:px-5">
        {pagada ? null : (
          <Button type="button" variant="outline" onClick={onOtroAbono}>
            Hacer otro abono
          </Button>
        )}
        <Button type="button" onClick={onListo} autoFocus>
          Listo
        </Button>
      </div>
    </div>
  );
}
