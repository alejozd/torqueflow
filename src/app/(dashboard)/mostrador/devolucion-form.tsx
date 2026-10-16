"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  crearDevolucionAction,
  type DevolucionFormState,
} from "@/app/actions/devolucion-mostrador-actions";
import {
  cantidadDevolvible,
  montoADevolverPermitido,
  repartoDevolucion,
  totalDevolucion,
} from "@/lib/mostrador/ventas";
import type { VentaMostradorFila } from "@/app/actions/venta-mostrador-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";

const initialState: DevolucionFormState = { error: null, success: false };

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const pesos = (valor: number) => formatoMoneda.format(valor);

const METODOS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "OTRO", label: "Otro" },
];

export type VentaDevolvible = Pick<
  VentaMostradorFila,
  "id" | "subtotal" | "total" | "saldoPendiente" | "totalDevuelto" | "items"
>;

/**
 * Devolución de una venta: se eligen líneas y cantidades, y el máximo lo dice la
 * **misma función pura que usa el servidor** (`cantidadDevolvible`), así que la
 * pantalla no puede ofrecer devolver más de lo vendido. Antes de confirmar dice
 * cuánto sale del cajón y cuánto baja de la deuda, con la misma cuenta del servidor.
 */
export function DevolucionForm({ venta }: { venta: VentaDevolvible }) {
  const devolver = crearDevolucionAction.bind(null, venta.id);
  const [state, formAction, isPending] = useActionState(devolver, initialState);
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [confirmando, setConfirmando] = useState(false);

  const devolvibles = venta.items
    .map((item) => ({ ...item, maximo: cantidadDevolvible(item.cantidad, item.devueltoCantidad) }))
    .filter((item) => item.maximo > 0);

  if (devolvibles.length === 0) {
    return <p className="text-sm text-muted-foreground">Esta venta ya se devolvió por completo.</p>;
  }

  const lineas = devolvibles
    .filter((item) => (cantidades[item.id] ?? 0) > 0)
    .map((item) => ({ ventaItemId: item.id, cantidad: cantidades[item.id] }));

  const unidades = lineas.reduce((suma, linea) => suma + (linea.cantidad ?? 0), 0);
  const valor = montoADevolverPermitido(
    venta.total,
    venta.totalDevuelto,
    totalDevolucion(
      devolvibles.map((item) => ({ cantidad: cantidades[item.id] ?? 0, precioUnitario: item.precioUnitario })),
      { subtotal: venta.subtotal, total: venta.total },
    ),
  );
  const { aCuenta, enEfectivo } = repartoDevolucion(valor, venta.saldoPendiente);
  const etiquetaMetodo = METODOS.find((metodo) => metodo.value === metodoPago)?.label ?? metodoPago;
  const salida =
    enEfectivo <= 0
      ? "No sale dinero"
      : metodoPago === "EFECTIVO"
        ? `Sale ${pesos(enEfectivo)} del cajón`
        : `Se devuelven ${pesos(enEfectivo)} por ${etiquetaMetodo.toLowerCase()} (no sale del cajón)`;
  const pregunta = `${salida}${aCuenta > 0 ? ` y la deuda baja ${pesos(aCuenta)}` : ""}; ${unidades} ${
    unidades === 1 ? "unidad vuelve" : "unidades vuelven"
  } a la bodega. ¿Devolver?`;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />
      <ul className="flex flex-col gap-2">
        {devolvibles.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {item.descripcion}{" "}
              <span className="text-muted-foreground">
                (vendidas {item.cantidad}, ya devueltas {item.devueltoCantidad})
              </span>
            </span>
            <Input
              aria-label={`Cantidad a devolver de ${item.descripcion}`}
              type="number"
              min={0}
              max={item.maximo}
              className="w-20 font-mono"
              value={cantidades[item.id] ?? 0}
              onChange={(evento) =>
                setCantidades((actuales) => ({
                  ...actuales,
                  [item.id]: Math.min(item.maximo, Math.max(0, Number(evento.target.value))),
                }))
              }
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`motivo-${venta.id}`}>Motivo (opcional)</Label>
          <Input id={`motivo-${venta.id}`} name="motivo" className="w-64" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`metodo-${venta.id}`}>Se devuelve por</Label>
          <SelectField
            id={`metodo-${venta.id}`}
            value={metodoPago}
            onValueChange={setMetodoPago}
            items={METODOS}
          />
          <input type="hidden" name="metodoPago" value={metodoPago} />
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setCantidades(Object.fromEntries(devolvibles.map((item) => [item.id, item.maximo])))}
      >
        Devolver todo
      </Button>

      {unidades > 0 ? (
        <dl data-testid="resumen-devolucion" className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md bg-muted p-3 text-sm">
          <dt className="text-muted-foreground">Valor devuelto</dt>
          <dd className="text-right font-mono">{pesos(valor)}</dd>
          {aCuenta > 0 ? (
            <>
              <dt className="text-muted-foreground">Baja de la deuda</dt>
              <dd className="text-right font-mono">{pesos(aCuenta)}</dd>
            </>
          ) : null}
          <dt className="font-medium">{metodoPago === "EFECTIVO" ? "Sale del cajón" : `Se devuelve por ${etiquetaMetodo.toLowerCase()}`}</dt>
          <dd className="text-right font-mono font-semibold">{pesos(enEfectivo)}</dd>
        </dl>
      ) : null}

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-muted-foreground">
          Devolución #{state.numero} registrada.
        </p>
      ) : null}

      {confirmando ? (
        <ConfirmacionEnLinea
          pregunta={pregunta}
          etiquetaConfirmar="Sí, devolver"
          enviaFormulario
          pendiente={isPending}
          onCancelar={() => setConfirmando(false)}
        />
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={lineas.length === 0} onClick={() => setConfirmando(true)} className="self-start">
          Devolver
        </Button>
      )}
    </form>
  );
}
