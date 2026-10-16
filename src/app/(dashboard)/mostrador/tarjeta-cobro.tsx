"use client";

import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from "react";
import { HandCoins, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TituloSeccion } from "@/components/titulo-seccion";
import { resumirPagos, type PagoEntrada } from "@/lib/mostrador/cobro";
import { roundMoney } from "@/lib/money/round";
import { cn } from "@/lib/utils";

/** Los métodos que se ofrecen en el mostrador (valores de `MetodoPago`). */
type Metodo = "EFECTIVO" | "TARJETA" | "TRANSFERENCIA";

const METODOS: { valor: Metodo; etiqueta: string }[] = [
  { valor: "EFECTIVO", etiqueta: "Efectivo" },
  { valor: "TARJETA", etiqueta: "Tarjeta" },
  { valor: "TRANSFERENCIA", etiqueta: "Transferencia" },
];

const MOTIVO_CAJA = "Caja cerrada: abre la caja para cobrar en efectivo";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const pesos = (valor: number) => formatoMoneda.format(valor);

/** Siguientes billetes redondos por encima del monto (spec §3.3): 260.015 → 270.000 y 300.000. */
export function billetesSugeridos(monto: number): number[] {
  if (!(monto > 0)) return [];
  const candidatos = [10_000, 50_000, 100_000].map((billete) => Math.ceil(monto / billete) * billete);
  return [...new Set(candidatos)].filter((valor) => valor > monto).slice(0, 2);
}

interface FilaPago {
  id: number;
  metodo: Metodo;
  /** Texto escrito; `null` = automático (lo que falta), solo en la última fila. */
  monto: string | null;
}

export interface CobroListo {
  pagos: PagoEntrada[];
  recibidoEfectivo: number | null;
}

export interface TarjetaCobroHandle {
  /** F9 / Ctrl+Enter: fuera del cobro lleva a "Recibido" (o a Cobrar); dentro, cobra. */
  irACobrar: () => void;
}

/**
 * Tarjeta de cobro del mostrador: un método (con Recibido, atajos de billetes y
 * vueltas para el efectivo), pago mixto con "+ Agregar otro método" (la última
 * fila se completa sola con lo que falta) y "Dejar a crédito" solo con cliente.
 * Lo que muestra sale de `resumirPagos`, la misma regla que valida el servidor.
 */
export function TarjetaCobro({
  total,
  hayCliente,
  efectivoBloqueado,
  motivoBloqueo,
  ocupado,
  onCobrar,
  ref,
}: {
  total: number;
  hayCliente: boolean;
  /** El taller usa control de caja y la de la sede está cerrada. */
  efectivoBloqueado: boolean;
  /** Motivo de fuera para no cobrar (carrito vacío, descuento sobre el tope…). */
  motivoBloqueo: string | null;
  ocupado: boolean;
  onCobrar: (cobro: CobroListo) => void;
  ref?: Ref<TarjetaCobroHandle>;
}) {
  const metodoInicial: Metodo = efectivoBloqueado ? "TARJETA" : "EFECTIVO";
  const [filas, setFilas] = useState<FilaPago[]>([{ id: 1, metodo: metodoInicial, monto: null }]);
  const [recibido, setRecibido] = useState("");
  const [creditoMarcado, setCreditoMarcado] = useState(false);
  const [enfocarRecibido, setEnfocarRecibido] = useState(0);
  const siguienteId = useRef(2);
  const formRef = useRef<HTMLFormElement>(null);
  const recibidoRef = useRef<HTMLInputElement>(null);
  const cobrarRef = useRef<HTMLButtonElement>(null);

  // Sin cliente no hay a quién cobrarle después: el crédito se apaga solo.
  const aCredito = creditoMarcado && hayCliente;
  const mixto = filas.length > 1;
  const recibidoNumero = recibido.trim() === "" ? null : Number(recibido);
  const recibidoValido = recibidoNumero !== null && Number.isFinite(recibidoNumero) ? recibidoNumero : null;

  /** Monto de cada fila: la última, si es automática, se lleva lo que falta. */
  const montos = filas.map((fila, indice) => {
    if (fila.monto !== null) return Number(fila.monto) || 0;
    if (indice < filas.length - 1) return 0;
    const otros = filas.slice(0, -1).reduce((suma, otra) => suma + (Number(otra.monto) || 0), 0);
    return Math.max(roundMoney(total - otros), 0);
  });

  let pagos: PagoEntrada[];
  if (aCredito) pagos = [];
  else if (!mixto && filas[0].metodo === "EFECTIVO" && recibidoValido !== null) {
    // Un solo pago en efectivo: si recibe menos que el total, eso es lo pagado.
    const monto = roundMoney(Math.min(recibidoValido, total));
    pagos = monto > 0 ? [{ metodoPago: "EFECTIVO", monto }] : [];
  } else {
    pagos = filas
      .map((fila, indice) => ({ metodoPago: fila.metodo, monto: montos[indice] }))
      .filter((pago) => pago.monto > 0);
  }

  const hayEfectivo = !aCredito && filas.some((fila) => fila.metodo === "EFECTIVO");
  const resumen = resumirPagos(total, pagos, hayEfectivo ? recibidoValido : null);
  const faltaEnEfectivo = !mixto && hayEfectivo && recibidoValido !== null && recibidoValido < total;

  let motivo: string | null = motivoBloqueo;
  if (!motivo && resumen.error) motivo = resumen.error;
  if (!motivo && efectivoBloqueado && hayEfectivo) motivo = MOTIVO_CAJA;
  if (!motivo && resumen.saldo > 0 && !hayCliente) {
    motivo = faltaEnEfectivo
      ? `Faltan ${pesos(resumen.saldo)}`
      : "Sin cliente registrado la venta tiene que quedar pagada";
  }
  const puedeCobrar = motivo === null && !ocupado;

  useEffect(() => {
    if (enfocarRecibido > 0) (recibidoRef.current ?? cobrarRef.current)?.focus();
  }, [enfocarRecibido]);

  useImperativeHandle(ref, () => ({
    irACobrar() {
      if (formRef.current?.contains(document.activeElement)) {
        formRef.current.requestSubmit();
        return;
      }
      if (!mixto && !aCredito && !efectivoBloqueado) {
        setFilas((actuales) => [{ ...actuales[0], metodo: "EFECTIVO" }]);
        setEnfocarRecibido((n) => n + 1);
      } else {
        cobrarRef.current?.focus();
      }
    },
  }));

  function elegirMetodo(metodo: Metodo) {
    setFilas((actuales) => [{ ...actuales[0], metodo }]);
  }

  function agregarMetodo() {
    const usados = new Set(filas.map((fila) => fila.metodo));
    const libre =
      METODOS.find((m) => !usados.has(m.valor) && !(m.valor === "EFECTIVO" && efectivoBloqueado))?.valor ?? "TARJETA";
    setFilas((actuales) => [
      // La fila que era automática queda con lo que tenía; la nueva se lleva lo que falte.
      ...actuales.map((fila, indice) => (fila.monto === null ? { ...fila, monto: String(montos[indice]) } : fila)),
      { id: siguienteId.current++, metodo: libre, monto: null },
    ]);
  }

  function cambiarFila(id: number, cambios: Partial<FilaPago>) {
    setFilas((actuales) => actuales.map((fila) => (fila.id === id ? { ...fila, ...cambios } : fila)));
  }

  function quitarFila(id: number) {
    setFilas((actuales) => {
      const quedan = actuales.filter((fila) => fila.id !== id);
      // Con una sola fila vuelve a ser el pago completo.
      return quedan.length === 1 ? [{ ...quedan[0], monto: null }] : quedan;
    });
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!puedeCobrar) return;
    onCobrar({ pagos, recibidoEfectivo: hayEfectivo ? recibidoValido : null });
  }

  const etiquetaCobrar = aCredito
    ? "Registrar a crédito"
    : `Cobrar ${pesos(resumen.error || pagos.length === 0 ? total : resumen.pagado)}`;

  return (
    <Card id="tarjeta-cobro">
      <CardHeader className="border-b">
        <CardTitle>
          <TituloSeccion icono={HandCoins}>Cobro</TituloSeccion>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={enviar} className="flex flex-col gap-3" aria-label="Cobro">
          {aCredito ? null : mixto ? (
            <div className="flex flex-col gap-2">
              {filas.map((fila, indice) => (
                <div key={fila.id} className="flex items-center gap-2">
                  <select
                    aria-label={`Método del pago ${indice + 1}`}
                    value={fila.metodo}
                    onChange={(evento) => cambiarFila(fila.id, { metodo: evento.target.value as Metodo })}
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    {METODOS.map((m) => (
                      <option
                        key={m.valor}
                        value={m.valor}
                        disabled={m.valor === "EFECTIVO" && efectivoBloqueado}
                      >
                        {m.etiqueta}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label={`Monto del pago ${indice + 1}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    className="min-w-0 flex-1 font-mono"
                    value={fila.monto ?? String(montos[indice])}
                    onChange={(evento) => cambiarFila(fila.id, { monto: evento.target.value })}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Quitar el pago ${indice + 1}`}
                    onClick={() => quitarFila(fila.id)}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div role="group" aria-label="Método de pago" className="grid grid-cols-3 gap-1">
              {METODOS.map((m) => {
                const bloqueado = m.valor === "EFECTIVO" && efectivoBloqueado;
                return (
                  <Button
                    key={m.valor}
                    type="button"
                    size="sm"
                    variant={filas[0].metodo === m.valor ? "default" : "outline"}
                    aria-pressed={filas[0].metodo === m.valor}
                    disabled={bloqueado}
                    aria-describedby={bloqueado ? "motivo-efectivo" : undefined}
                    onClick={() => elegirMetodo(m.valor)}
                  >
                    {m.etiqueta}
                  </Button>
                );
              })}
            </div>
          )}
          {efectivoBloqueado && !aCredito ? (
            <p id="motivo-efectivo" className="text-xs text-destructive">
              {MOTIVO_CAJA}.{" "}
              <a href="/caja" className="underline underline-offset-2">
                Abrir caja
              </a>
            </p>
          ) : null}

          {hayEfectivo ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="recibido-efectivo" className="text-sm text-muted-foreground">
                Recibido
              </label>
              <Input
                ref={recibidoRef}
                id="recibido-efectivo"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                placeholder={pesos(total)}
                className="font-mono"
                value={recibido}
                onChange={(evento) => setRecibido(evento.target.value)}
              />
              {!mixto ? (
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="xs" variant="outline" onClick={() => setRecibido(String(total))}>
                    Justo
                  </Button>
                  {billetesSugeridos(total).map((billete) => (
                    <Button key={billete} type="button" size="xs" variant="outline" onClick={() => setRecibido(String(billete))}>
                      {pesos(billete)}
                    </Button>
                  ))}
                </div>
              ) : null}
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-sm text-muted-foreground">Vueltas</span>
                <span data-testid="vueltas" className="font-mono text-2xl font-bold">
                  {pesos(resumen.error ? 0 : resumen.vueltas)}
                </span>
              </div>
              {faltaEnEfectivo ? (
                <p className="text-sm font-medium text-amber-600">Faltan {pesos(roundMoney(total - (recibidoValido ?? 0)))}</p>
              ) : null}
            </div>
          ) : null}

          {!aCredito ? (
            <Button type="button" size="sm" variant="ghost" className="self-start" onClick={agregarMetodo}>
              + Agregar otro método
            </Button>
          ) : null}

          {hayCliente ? (
            <Button
              type="button"
              size="sm"
              variant={aCredito ? "secondary" : "ghost"}
              className="self-start"
              aria-pressed={aCredito}
              onClick={() => setCreditoMarcado((v) => !v)}
            >
              {aCredito ? "Cobrar ahora" : "Dejar a crédito"}
            </Button>
          ) : null}

          {hayCliente && resumen.saldo > 0 && !resumen.error && motivoBloqueo === null ? (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-400">
              Queda debiendo {pesos(resumen.saldo)}
            </p>
          ) : null}

          <Button
            ref={cobrarRef}
            type="submit"
            size="lg"
            disabled={!puedeCobrar}
            aria-describedby={motivo ? "motivo-cobro" : undefined}
            className={cn("w-full", ocupado && "opacity-70")}
          >
            {ocupado ? "Cobrando..." : etiquetaCobrar}
            <kbd aria-hidden className="ml-2 hidden font-mono text-xs opacity-70 sm:inline">F9</kbd>
          </Button>
          {motivo && !(faltaEnEfectivo && motivo.startsWith("Faltan")) ? (
            <p id="motivo-cobro" className="text-xs text-muted-foreground">
              {motivo}
            </p>
          ) : motivo ? (
            <span id="motivo-cobro" className="sr-only">
              {motivo}
            </span>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
