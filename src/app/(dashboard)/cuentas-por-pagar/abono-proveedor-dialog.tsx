"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { abonarProveedorAction, type AbonoProveedorFormState } from "@/app/actions/cuenta-por-pagar-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DIAS_URGENTE } from "@/lib/proveedores/cuentas-por-pagar";
import { ordenarParaRepartir, repartirAbono } from "@/lib/proveedores/repartir-abono";
import { roundMoney } from "@/lib/money/round";
import { cn } from "@/lib/utils";
import {
  AvisoEfectivo,
  CampoMonto,
  CampoReferencia,
  ChipMonto,
  esErrorDeCaja,
  METODO_EN_FRASE,
  SelectorMetodo,
} from "./campos-abono";
import { PUNTO, TEXTO_VERDE, pesos, plural, type MetodoPagoAbono } from "./presentacion";

/** Lo que el diálogo necesita del proveedor y sus entradas por pagar. */
export interface ProveedorAbono {
  proveedorId: string;
  proveedorNombre: string;
  cuentas: { cuentaId: string; fecha: Date; fechaTexto: string; dias: number; saldo: number }[];
}

const initialState: AbonoProveedorFormState = { error: null, success: false };

function sinAviso() {}

/**
 * «Abonar al proveedor»: un solo pago repartido entre sus entradas, empezando
 * por la más vieja. La tabla «Así se reparte» usa la misma función que el
 * servidor, así que lo que se ve es lo que se registra.
 */
export function AbonoProveedorDialog({
  proveedor,
  version = 0,
  cajaAbierta,
  open,
  onOpenChange,
  onRegistrado = sinAviso,
}: {
  proveedor: ProveedorAbono;
  version?: number;
  cajaAbierta: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se registró el abono: las cuentas tocadas (la lista las resalta). */
  onRegistrado?: (cuentaIds: string[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px] max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:rounded-none"
      >
        <FormularioAbonoProveedor
          key={`${proveedor.proveedorId}-${version}`}
          proveedor={proveedor}
          cajaAbierta={cajaAbierta}
          onListo={() => onOpenChange(false)}
          onRegistrado={onRegistrado}
        />
      </DialogContent>
    </Dialog>
  );
}

function FormularioAbonoProveedor({
  proveedor,
  cajaAbierta,
  onListo,
  onRegistrado,
}: {
  proveedor: ProveedorAbono;
  cajaAbierta: boolean;
  onListo: () => void;
  onRegistrado: (cuentaIds: string[]) => void;
}) {
  const abonar = abonarProveedorAction.bind(null, proveedor.proveedorId);
  const [state, formAction, isPending] = useActionState(abonar, initialState);
  const [monto, setMonto] = useState<number | null>(null);
  const [chip, setChip] = useState<"todo" | "viejas" | null>(null);
  const [metodo, setMetodo] = useState<MetodoPagoAbono>("TRANSFERENCIA");
  const [referencia, setReferencia] = useState("");

  const avisado = useRef<AbonoProveedorFormState | null>(null);
  useEffect(() => {
    if (state.success && state.cuentaIds && avisado.current !== state) {
      avisado.current = state;
      onRegistrado(state.cuentaIds);
    }
  }, [state, onRegistrado]);

  const cuentas = useMemo(
    () => ordenarParaRepartir(proveedor.cuentas.filter((cuenta) => cuenta.saldo > 0)),
    [proveedor.cuentas],
  );
  const deuda = roundMoney(cuentas.reduce((suma, cuenta) => suma + cuenta.saldo, 0));
  const viejas = roundMoney(
    cuentas.filter((cuenta) => cuenta.dias > DIAS_URGENTE).reduce((suma, cuenta) => suma + cuenta.saldo, 0),
  );
  const masVieja = cuentas.reduce((max, cuenta) => Math.max(max, cuenta.dias), 0);

  const excede = monto !== null && monto > deuda;
  const reparto = repartirAbono(cuentas, excede ? 0 : (monto ?? 0));
  const tocadas = reparto.filter((porcion) => porcion.recibe > 0).length;
  const errorDeCaja = esErrorDeCaja(state.error);
  const efectivoBloqueado = metodo === "EFECTIVO" && (!cajaAbierta || errorDeCaja);
  const puedeEnviar = monto !== null && monto > 0 && !excede && !efectivoBloqueado && !isPending;

  if (state.success) {
    const registrado = state.montoRegistrado ?? monto ?? 0;
    const entradas = state.cuentaIds?.length ?? tocadas;
    const restante = state.saldoRestante ?? Math.max(0, deuda - registrado);
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div role="status" className="flex flex-1 flex-col items-center justify-center px-5 pt-6 pb-4 text-center">
          <span className={cn("text-5xl leading-none font-bold", TEXTO_VERDE)} aria-hidden>
            ✓
          </span>
          <DialogTitle className="mt-2 text-lg font-semibold">Abono registrado</DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            <b className="font-mono font-semibold text-foreground tabular-nums">{pesos(registrado)}</b> a{" "}
            {proveedor.proveedorNombre} por {METODO_EN_FRASE[metodo]}, repartido en{" "}
            {plural(entradas, "entrada", "entradas")}
            {referencia.trim() ? ` · ref. ${referencia.trim()}` : ""}
          </DialogDescription>
          <p className="mt-1 text-sm text-muted-foreground">
            {restante <= 0 ? (
              <>Ya no le debes nada a {proveedor.proveedorNombre}. Sus entradas están en «Pagadas».</>
            ) : (
              <>
                Todavía le debes{" "}
                <b className="font-mono font-semibold text-foreground tabular-nums">{pesos(restante)}</b>.
              </>
            )}
          </p>
        </div>
        <div className="flex justify-center border-t bg-muted/40 px-4 py-3 sm:px-5">
          <Button type="button" onClick={onListo} autoFocus>
            Listo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="monto" value={monto ?? ""} />
      <input type="hidden" name="metodoPago" value={metodo} />

      <div className="flex items-start justify-between gap-3 border-b px-4 pt-3.5 pb-2.5 sm:px-5">
        <div className="min-w-0">
          <DialogTitle className="text-base font-semibold">Abonar a {proveedor.proveedorNombre}</DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            Un solo pago repartido entre sus entradas, empezando por la más vieja.
          </DialogDescription>
        </div>
        <DialogClose render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar" />}>
          <X aria-hidden />
        </DialogClose>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
          <div>
            <dt className="text-[11px] text-muted-foreground">Entradas por pagar</dt>
            <dd className="font-semibold">{cuentas.length}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">La más vieja</dt>
            <dd className="font-semibold">{plural(masVieja, "día", "días")}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Le debes</dt>
            <dd className="font-mono font-semibold text-[oklch(0.5_0.15_60)] tabular-nums">{pesos(deuda)}</dd>
          </div>
        </dl>

        <div>
          <CampoMonto
            id="monto-abono-proveedor"
            etiqueta="¿Cuánto le vas a pagar en total?"
            monto={monto}
            error={excede ? `No puedes pagar más de lo que le debes (${pesos(deuda)}).` : null}
            onCambio={(nuevo) => {
              setMonto(nuevo);
              setChip(null);
            }}
          />
          <div role="group" aria-label="Montos rápidos" className="mt-2 flex flex-wrap gap-1.5">
            <ChipMonto
              punto={PUNTO.verde}
              activo={chip === "todo"}
              onClick={() => {
                setChip("todo");
                setMonto(deuda);
              }}
            >
              Todo · <span className="font-mono tabular-nums">{pesos(deuda)}</span>
            </ChipMonto>
            {viejas > 0 && viejas < deuda ? (
              <ChipMonto
                punto={PUNTO.ambar}
                activo={chip === "viejas"}
                onClick={() => {
                  setChip("viejas");
                  setMonto(viejas);
                }}
              >
                Lo de más de {DIAS_URGENTE} días · <span className="font-mono tabular-nums">{pesos(viejas)}</span>
              </ChipMonto>
            ) : null}
          </div>
        </div>

        {/* Así se reparte: se actualiza mientras se escribe. */}
        <div className="overflow-hidden rounded-lg border text-xs" aria-live="polite">
          <table className="w-full">
            <caption className="sr-only">Cómo se reparte el pago entre las entradas</caption>
            <thead className="bg-muted/50 text-[11px] text-muted-foreground">
              <tr>
                <th scope="col" className="px-2.5 py-1.5 text-left font-medium">
                  Así se reparte
                </th>
                <th scope="col" className="px-2.5 py-1.5 text-right font-medium">
                  Recibe
                </th>
                <th scope="col" className="px-2.5 py-1.5 text-right font-medium">
                  Después
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reparto.map((porcion, indice) => {
                const cuenta = cuentas[indice]!;
                return (
                  <tr key={porcion.cuentaId}>
                    <td className="px-2.5 py-1.5">
                      Entrada del {cuenta.fechaTexto}{" "}
                      <span className="text-muted-foreground">· {plural(cuenta.dias, "día", "días")}</span>
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                      {porcion.recibe > 0 ? pesos(porcion.recibe) : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      {porcion.recibe > 0 && porcion.queda <= 0 ? (
                        <span className={cn("font-semibold", TEXTO_VERDE)}>✓ Queda pagada</span>
                      ) : (
                        <span className="font-mono tabular-nums">debe {pesos(porcion.queda)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-semibold">¿Cómo le pagas?</span>
          <SelectorMetodo metodo={metodo} onCambio={setMetodo} />
          <AvisoEfectivo
            metodo={metodo}
            bloqueado={efectivoBloqueado}
            errorServidor={errorDeCaja ? state.error : null}
          />
        </div>

        <CampoReferencia id="referencia-abono-proveedor" metodo={metodo} valor={referencia} onCambio={setReferencia} />

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
              : `Registrar ${pesos(monto)} en ${plural(Math.max(tocadas, 1), "entrada", "entradas")}`}
        </Button>
      </div>
    </form>
  );
}
