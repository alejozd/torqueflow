"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { crearVentaMostradorAction, type RepuestoMostrador, type VentaMostradorFormState } from "@/app/actions/venta-mostrador-actions";
import { calcularTotalesVenta } from "@/lib/mostrador/ventas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const initialState: VentaMostradorFormState = { error: null, success: false };

export interface LineaCarrito {
  key: string;
  repuestoId: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/**
 * Carrito del mostrador. Los totales se calculan con **el mismo módulo puro que
 * usa el servidor** (`calcularTotalesVenta`), así que lo que ve el cajero es
 * exactamente lo que se va a guardar; el descuento es un monto, como en la
 * factura. Las líneas viajan como JSON en un campo del formulario.
 */
export function CarritoMostrador({
  repuestos,
  clientes,
  cajaAbierta,
}: {
  repuestos: RepuestoMostrador[];
  clientes: { id: string; nombre: string }[];
  cajaAbierta: boolean;
}) {
  const [state, formAction, isPending] = useActionState(crearVentaMostradorAction, initialState);
  const [busqueda, setBusqueda] = useState("");
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [descuento, setDescuento] = useState("");
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [cobrarTodo, setCobrarTodo] = useState(true);
  const [numeroConfirmado, setNumeroConfirmado] = useState<number | undefined>(undefined);

  // Vaciar el carrito en cuanto el servidor confirma una venta nueva. Se hace
  // durante el render (el patrón que React documenta para "ajustar estado cuando
  // cambia algo de fuera") y no en un efecto: dejar las líneas ahí invitaría a
  // cobrar dos veces lo mismo.
  if (state.success && state.numero !== numeroConfirmado) {
    setNumeroConfirmado(state.numero);
    setLineas([]);
    setDescuento("");
    setCobrarTodo(true);
    setBusqueda("");
  }

  const encontrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const lista = texto
      ? repuestos.filter(
          (repuesto) =>
            repuesto.nombre.toLowerCase().includes(texto) || repuesto.codigo.toLowerCase().includes(texto),
        )
      : repuestos;
    return lista.slice(0, 8);
  }, [busqueda, repuestos]);

  function enCarrito(repuestoId: string): number {
    return lineas
      .filter((linea) => linea.repuestoId === repuestoId)
      .reduce((suma, linea) => suma + linea.cantidad, 0);
  }

  function agregar(repuesto: RepuestoMostrador) {
    const yaEnCarrito = enCarrito(repuesto.id);
    if (yaEnCarrito >= repuesto.disponible) return;
    setLineas((actuales) => [
      ...actuales,
      {
        key: `${repuesto.id}-${actuales.length}`,
        repuestoId: repuesto.id,
        descripcion: repuesto.nombre,
        cantidad: 1,
        precioUnitario: repuesto.precioVenta,
      },
    ]);
    setBusqueda("");
  }

  function agregarLibre() {
    setLineas((actuales) => [
      ...actuales,
      { key: `libre-${actuales.length}`, repuestoId: null, descripcion: "", cantidad: 1, precioUnitario: 0 },
    ]);
  }

  function cambiar(key: string, cambios: Partial<LineaCarrito>) {
    setLineas((actuales) => actuales.map((linea) => (linea.key === key ? { ...linea, ...cambios } : linea)));
  }

  const totales = calcularTotalesVenta(lineas, Number(descuento) || 0);
  const sinCliente = clienteId === "";
  const puedeGuardar = cajaAbierta && lineas.length > 0 && !(sinCliente && !cobrarTodo);

  return (
    <div className="flex flex-col gap-4">
      {!cajaAbierta ? (
        <Alert variant="destructive">
          <AlertDescription>
            Abre la caja de tu sede antes de vender en el mostrador: sin caja abierta el cobro quedaría fuera del
            arqueo.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="buscarRepuesto">Buscar repuesto</Label>
        <Input
          id="buscarRepuesto"
          placeholder="Nombre o código"
          value={busqueda}
          disabled={!cajaAbierta}
          onChange={(evento) => setBusqueda(evento.target.value)}
        />
        {busqueda.trim() ? (
          <ul className="mt-1 divide-y rounded-md border">
            {encontrados.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</li>
            ) : (
              encontrados.map((repuesto) => {
                const libres = repuesto.disponible - enCarrito(repuesto.id);
                return (
                  <li key={repuesto.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{repuesto.nombre}</span>{" "}
                      <span className="font-mono text-muted-foreground">{repuesto.codigo}</span>
                      <span className="ml-2 text-muted-foreground">
                        {libres > 0 ? `${libres} disponibles` : "sin unidades libres"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono">{formatoMoneda.format(repuesto.precioVenta)}</span>
                      <Button type="button" size="sm" variant="outline" disabled={libres <= 0} onClick={() => agregar(repuesto)}>
                        Agregar
                      </Button>
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>

      <form
        action={formAction}
        className="flex flex-col gap-4"
        data-testid="form-carrito"
      >
        <input type="hidden" name="lineas" value={JSON.stringify(
          lineas.map((linea) => ({
            repuestoId: linea.repuestoId ?? undefined,
            descripcion: linea.descripcion,
            cantidad: linea.cantidad,
            precioUnitario: linea.precioUnitario,
          })),
        )} />

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Producto</th>
              <th className="w-24 py-1">Cantidad</th>
              <th className="w-32 py-1">Precio</th>
              <th className="w-28 py-1 text-right">Importe</th>
              <th className="w-10 py-1" />
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-muted-foreground">
                  Todavía no has agregado nada. Busca un repuesto arriba.
                </td>
              </tr>
            ) : null}
            {lineas.map((linea) => {
              const repuesto = linea.repuestoId ? repuestos.find((r) => r.id === linea.repuestoId) : undefined;
              const maximo = repuesto ? repuesto.disponible - (enCarrito(repuesto.id) - linea.cantidad) : 9999;
              return (
                <tr key={linea.key} className="border-t">
                  <td className="py-2">
                    <Input
                      aria-label="Descripción"
                      value={linea.descripcion}
                      onChange={(evento) => cambiar(linea.key, { descripcion: evento.target.value })}
                    />
                  </td>
                  <td className="py-2">
                    <Input
                      aria-label="Cantidad"
                      type="number"
                      min={1}
                      max={maximo}
                      className="font-mono"
                      value={linea.cantidad}
                      onChange={(evento) => cambiar(linea.key, { cantidad: Number(evento.target.value) })}
                    />
                  </td>
                  <td className="py-2">
                    <Input
                      aria-label="Precio"
                      type="number"
                      min={0}
                      step="0.01"
                      className="font-mono"
                      value={linea.precioUnitario}
                      onChange={(evento) => cambiar(linea.key, { precioUnitario: Number(evento.target.value) })}
                    />
                  </td>
                  <td className="py-2 text-right font-mono">
                    {formatoMoneda.format(linea.cantidad * linea.precioUnitario)}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setLineas((actuales) => actuales.filter((actual) => actual.key !== linea.key))}
                    >
                      Quitar
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <Button type="button" variant="outline" size="sm" className="self-start" onClick={agregarLibre}>
          Agregar línea libre
        </Button>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clienteId">Cliente (opcional)</Label>
            <SelectField
              id="clienteId"
              value={clienteId}
              onValueChange={setClienteId}
              items={[{ value: "", label: "Consumidor final" }, ...clientes.map((c) => ({ value: c.id, label: c.nombre }))]}
            />
            {sinCliente ? (
              <p className="text-xs text-muted-foreground">Sin cliente, la venta tiene que quedar pagada.</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="descuento">Descuento</Label>
            <Input
              id="descuento"
              type="number"
              min={0}
              step="0.01"
              className="font-mono"
              value={descuento}
              onChange={(evento) => setDescuento(evento.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="metodoPago">Cobro</Label>
            <SelectField
              id="metodoPago"
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="cobrarTodo"
                value="true"
                checked={cobrarTodo}
                onChange={(evento) => setCobrarTodo(evento.target.checked)}
              />
              Cobrar todo ahora
            </label>
            {!cobrarTodo ? <input type="hidden" name="cobrarTodo" value="" /> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Total</Label>
            <dl className="text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-mono">{formatoMoneda.format(totales.subtotal)}</dd>
              </div>
              {totales.descuento > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Descuento</dt>
                  <dd className="font-mono">-{formatoMoneda.format(totales.descuento)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">IVA 19%</dt>
                <dd className="font-mono">{formatoMoneda.format(totales.iva)}</dd>
              </div>
              <div className="flex justify-between font-medium">
                <dt>Total</dt>
                <dd className="font-mono" data-testid="total-venta">
                  {formatoMoneda.format(totales.total)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? (
          <p role="status" className="text-sm text-muted-foreground">
            Venta #{state.numero} registrada.
          </p>
        ) : null}

        <Button type="submit" disabled={!puedeGuardar || isPending} className="self-start">
          {isPending ? "Registrando..." : "Registrar venta"}
        </Button>
      </form>
    </div>
  );
}
