"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  crearDevolucionAction,
  type DevolucionFormState,
} from "@/app/actions/devolucion-mostrador-actions";
import { cantidadDevolvible } from "@/lib/mostrador/ventas";
import type { VentaMostradorDia } from "@/app/actions/venta-mostrador-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";

const initialState: DevolucionFormState = { error: null, success: false };

/**
 * Devolución de una venta: se eligen líneas y cantidades, y el máximo lo dice la
 * **misma función pura que usa el servidor** (`cantidadDevolvible`), así que la
 * pantalla no puede ofrecer devolver más de lo vendido.
 */
export function DevolucionForm({ venta }: { venta: VentaMostradorDia }) {
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
            items={[
              { value: "EFECTIVO", label: "Efectivo" },
              { value: "TARJETA", label: "Tarjeta" },
              { value: "TRANSFERENCIA", label: "Transferencia" },
              { value: "OTRO", label: "Otro" },
            ]}
          />
          <input type="hidden" name="metodoPago" value={metodoPago} />
        </div>
      </div>

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
          pregunta="¿Devolver esta venta? Sale dinero del cajón y el stock vuelve a la bodega."
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
