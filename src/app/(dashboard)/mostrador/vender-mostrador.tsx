"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ShoppingCart, UserRound } from "lucide-react";
import {
  crearVentaMostradorAction,
  type VentaMostradorFormState,
} from "@/app/actions/venta-mostrador-actions";
import {
  DESCUENTO_VACIO,
  EditorDescuentoLocal,
  evaluarDescuento,
  type DescuentoLocal,
} from "@/components/editor-descuento";
import { ResumenEconomico } from "@/components/resumen-economico";
import { TituloSeccion } from "@/components/titulo-seccion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { calcularTotalesVenta } from "@/lib/mostrador/ventas";
import { AyudaAtajos } from "./ayuda-atajos";
import { TablaCarrito } from "./tabla-carrito";
import { TarjetaCobro, type CobroListo, type TarjetaCobroHandle } from "./tarjeta-cobro";
import { useAtajosMostrador } from "./use-atajos-mostrador";
import { useCarrito } from "./use-carrito";

const initialState: VentaMostradorFormState = { error: null, success: false };

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoPorcentaje = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const ID_CLIENTE = "cliente-mostrador";

/**
 * Pestaña "Vender" del mostrador (spec §3.1): cliente y carrito a la izquierda;
 * resumen con descuento y tarjeta de cobro en una columna lateral pegajosa. En
 * pantallas angostas una barra fija abajo lleva el total y el botón Cobrar.
 * Los totales salen de `calcularTotalesVenta`, el mismo cálculo del servidor.
 */
export function VenderMostrador({
  clientes,
  efectivoBloqueado,
  rol,
  descuentoMaxRecepcion,
}: {
  clientes: { id: string; nombre: string }[];
  efectivoBloqueado: boolean;
  rol: "ADMIN" | "RECEPCION";
  descuentoMaxRecepcion: number;
}) {
  const carrito = useCarrito();
  const [state, formAction, isPending] = useActionState(crearVentaMostradorAction, initialState);
  const [clienteId, setClienteId] = useState("");
  const [descuento, setDescuento] = useState<DescuentoLocal>(DESCUENTO_VACIO);
  const [numeroConfirmado, setNumeroConfirmado] = useState<number | undefined>(undefined);
  /** Cambia con cada venta cobrada: reinicia la tarjeta de cobro (métodos, recibido). */
  const [ventaActual, setVentaActual] = useState(0);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const buscadorRef = useRef<HTMLInputElement | null>(null);
  const descuentoRef = useRef<HTMLInputElement>(null);
  const tarjetaRef = useRef<TarjetaCobroHandle>(null);

  // Vaciar el carrito en cuanto el servidor confirma una venta nueva (durante el
  // render, el patrón de React para "ajustar estado cuando cambia algo de fuera").
  // Si el servidor responde un error (stock, caja…) el carrito se queda como está.
  if (state.success && state.numero !== numeroConfirmado) {
    setNumeroConfirmado(state.numero);
    carrito.vaciar();
    setDescuento(DESCUENTO_VACIO);
    setVentaActual((n) => n + 1);
  }

  useEffect(() => {
    if (numeroConfirmado !== undefined) buscadorRef.current?.focus();
  }, [numeroConfirmado]);

  useAtajosMostrador({
    focusBuscador: () => buscadorRef.current?.focus(),
    irACobrar: () => tarjetaRef.current?.irACobrar(),
    buscarCliente: () => document.getElementById(ID_CLIENTE)?.focus(),
    descuento: () => descuentoRef.current?.focus(),
    ayuda: () => setAyudaAbierta(true),
  });

  const tope = rol === "ADMIN" ? null : descuentoMaxRecepcion;
  const subtotalBruto = calcularTotalesVenta(carrito.lineas, 0).subtotal;
  const evaluacion = evaluarDescuento(subtotalBruto, descuento, tope);
  const totales = calcularTotalesVenta(carrito.lineas, evaluacion.error ? 0 : evaluacion.monto);
  const motivoBloqueo = carrito.lineas.length === 0 ? "Agrega al menos un producto" : evaluacion.error;
  const cliente = clientes.find((c) => c.id === clienteId);

  function cobrar({ pagos, recibidoEfectivo }: CobroListo) {
    const datos = new FormData();
    datos.set(
      "lineas",
      JSON.stringify(
        carrito.lineas.map((linea) => ({
          repuestoId: linea.repuestoId ?? undefined,
          descripcion: linea.descripcion,
          cantidad: linea.cantidad,
          precioUnitario: linea.precioUnitario,
        })),
      ),
    );
    datos.set("pagos", JSON.stringify(pagos));
    datos.set("descuento", String(totales.descuento));
    if (clienteId) datos.set("clienteId", clienteId);
    if (recibidoEfectivo !== null) datos.set("recibidoEfectivo", String(recibidoEfectivo));
    startTransition(() => formAction(datos));
  }

  return (
    <div className="grid grid-cols-1 gap-4 pb-24 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:pb-0">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center justify-between gap-2">
              <TituloSeccion icono={UserRound}>Cliente</TituloSeccion>
              <kbd className="font-mono text-xs font-normal text-muted-foreground">F2</kbd>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className={cliente ? "text-sm font-medium" : "text-sm text-muted-foreground"} data-testid="cliente-actual">
              {cliente?.nombre ?? "Consumidor final"}
            </p>
            <SelectField
              id={ID_CLIENTE}
              aria-describedby="cliente-ayuda"
              value={clienteId}
              onValueChange={setClienteId}
              items={[{ value: "", label: "Consumidor final" }, ...clientes.map((c) => ({ value: c.id, label: c.nombre }))]}
            />
            <p id="cliente-ayuda" className="text-xs text-muted-foreground">
              {cliente
                ? "Con cliente registrado puedes dejar saldo a crédito."
                : "Sin cliente, la venta tiene que quedar pagada."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>
              <TituloSeccion icono={ShoppingCart}>Productos</TituloSeccion>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TablaCarrito carrito={carrito} buscadorRef={buscadorRef} />
          </CardContent>
        </Card>

        <p className="hidden text-xs text-muted-foreground lg:block">
          Esc limpia el buscador · F9 cobra ·{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => setAyudaAbierta(true)}>
            ? atajos
          </button>
        </p>

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
      </div>

      <div id="bloque-cobro" className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <ResumenEconomico
          titulo="Resumen"
          encabezado={`${carrito.totalProductos} ${carrito.totalProductos === 1 ? "producto" : "productos"} · ${carrito.totalUnidades} ${carrito.totalUnidades === 1 ? "unidad" : "unidades"}`}
          subtotal={totales.subtotal}
          descuento={totales.descuento}
          etiquetaDescuento={`Descuento ${formatoPorcentaje.format(evaluacion.porcentaje)} %`}
          iva={totales.iva}
          total={totales.total}
          etiquetaTotal="Total a cobrar"
          editorDescuento={
            <EditorDescuentoLocal
              descuento={descuento}
              onCambiar={setDescuento}
              tope={tope}
              error={evaluacion.error}
              inputRef={descuentoRef}
            />
          }
        />
        <TarjetaCobro
          key={ventaActual}
          ref={tarjetaRef}
          total={totales.total}
          hayCliente={Boolean(cliente)}
          efectivoBloqueado={efectivoBloqueado}
          motivoBloqueo={motivoBloqueo}
          ocupado={isPending}
          onCobrar={cobrar}
        />
      </div>

      {/* Angosto (spec §3.2): el total y Cobrar siempre a mano. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-mono text-lg font-bold">{formatoMoneda.format(totales.total)}</p>
        </div>
        <Button type="button" size="lg" onClick={() => tarjetaRef.current?.irACobrar()}>
          Cobrar
        </Button>
      </div>

      <AyudaAtajos abierta={ayudaAbierta} onCambiar={setAyudaAbierta} />
    </div>
  );
}
