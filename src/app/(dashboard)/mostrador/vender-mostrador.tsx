"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { ShoppingCart, UserRound } from "lucide-react";
import {
  crearVentaMostradorAction,
  type ClienteMostrador,
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
import { calcularTotalesVenta } from "@/lib/mostrador/ventas";
import { AyudaAtajos } from "./ayuda-atajos";
import { SelectorCliente } from "./selector-cliente";
import { TablaCarrito } from "./tabla-carrito";
import { TarjetaCobro, type CobroListo, type TarjetaCobroHandle } from "./tarjeta-cobro";
import { useAtajosMostrador } from "./use-atajos-mostrador";
import { useCarrito } from "./use-carrito";
import { VentaCobrada, type VentaCobradaDatos } from "./venta-cobrada";

const initialState: VentaMostradorFormState = { error: null, success: false };

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoPorcentaje = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/**
 * Pestaña "Vender" del mostrador (spec §3.1): cliente y carrito a la izquierda;
 * resumen con descuento y tarjeta de cobro en una columna lateral pegajosa. En
 * pantallas angostas una barra fija abajo lleva el total y el botón Cobrar.
 * Los totales salen de `calcularTotalesVenta`, el mismo cálculo del servidor.
 */
export function VenderMostrador({
  efectivoBloqueado,
  rol,
  descuentoMaxRecepcion,
}: {
  efectivoBloqueado: boolean;
  rol: "ADMIN" | "RECEPCION";
  descuentoMaxRecepcion: number;
}) {
  const carrito = useCarrito();
  const [state, formAction, isPending] = useActionState(crearVentaMostradorAction, initialState);
  const [cliente, setCliente] = useState<ClienteMostrador | null>(null);
  const [descuento, setDescuento] = useState<DescuentoLocal>(DESCUENTO_VACIO);
  const [numeroConfirmado, setNumeroConfirmado] = useState<number | undefined>(undefined);
  /** Cambia con cada venta cobrada: reinicia la tarjeta de cobro (métodos, recibido). */
  const [ventaActual, setVentaActual] = useState(0);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const buscadorRef = useRef<HTMLInputElement | null>(null);
  const clienteRef = useRef<HTMLInputElement>(null);
  const descuentoRef = useRef<HTMLInputElement>(null);
  const tarjetaRef = useRef<TarjetaCobroHandle>(null);

  const [ventaCobrada, setVentaCobrada] = useState<VentaCobradaDatos | null>(null);

  // En cuanto el servidor confirma una venta nueva el carrito se vacía y en su
  // lugar sale la tarjeta de venta cobrada (durante el render, el patrón de React
  // para "ajustar estado cuando cambia algo de fuera"). Si el servidor responde
  // un error (stock, caja…) el carrito se queda como está.
  if (state.success && state.numero !== numeroConfirmado) {
    setNumeroConfirmado(state.numero);
    carrito.vaciar();
    setDescuento(DESCUENTO_VACIO);
    setVentaActual((n) => n + 1);
    // Sin id o número no hay comprobante al que apuntar: no se inventa una tarjeta.
    setVentaCobrada(
      state.ventaId && state.numero !== undefined
        ? {
            ventaId: state.ventaId,
            numero: state.numero,
            total: state.total ?? 0,
            pagos: state.pagos ?? [],
            vueltas: state.vueltas ?? 0,
            saldoPendiente: state.saldoPendiente ?? 0,
            cliente: state.cliente ?? null,
            urlWhatsapp: state.urlWhatsapp ?? null,
          }
        : null,
    );
  }

  // Marca roja de stock (spec §3.3): se toma la cantidad de cada fila rechazada al
  // llegar el error, y la marca se va en cuanto esa fila cambia de cantidad o se quita.
  const [marcaStock, setMarcaStock] = useState<{
    fuente: VentaMostradorFormState;
    cantidades: Record<string, number>;
  } | null>(null);
  const cantidadEnCarrito = (repuestoId: string) =>
    carrito.lineas.find((linea) => linea.repuestoId === repuestoId)?.cantidad;
  if (!state.success && state.repuestosSinStock?.length && marcaStock?.fuente !== state) {
    setMarcaStock({
      fuente: state,
      cantidades: Object.fromEntries(state.repuestosSinStock.map((id) => [id, cantidadEnCarrito(id) ?? 0])),
    });
  }
  const marcasVigentes = Object.entries(marcaStock?.cantidades ?? {}).filter(
    ([id, cantidad]) => cantidadEnCarrito(id) === cantidad,
  );
  if (marcaStock && marcasVigentes.length < Object.keys(marcaStock.cantidades).length) {
    // Se corrigió una fila: su marca no vuelve aunque se deje otra vez la misma cantidad.
    setMarcaStock({ fuente: marcaStock.fuente, cantidades: Object.fromEntries(marcasVigentes) });
  }
  const sinStock = marcasVigentes.map(([id]) => id);

  /** Enter en la tarjeta: venta limpia; el carrito vuelve a montarse con el foco en el buscador. */
  function nuevaVenta() {
    setVentaCobrada(null);
    setCliente(null);
  }

  useAtajosMostrador({
    focusBuscador: () => buscadorRef.current?.focus(),
    irACobrar: () => tarjetaRef.current?.irACobrar(),
    buscarCliente: () => clienteRef.current?.focus(),
    descuento: () => descuentoRef.current?.focus(),
    ayuda: () => setAyudaAbierta(true),
  });

  const tope = rol === "ADMIN" ? null : descuentoMaxRecepcion;
  const subtotalBruto = calcularTotalesVenta(carrito.lineas, 0).subtotal;
  const evaluacion = evaluarDescuento(subtotalBruto, descuento, tope);
  const totales = calcularTotalesVenta(carrito.lineas, evaluacion.error ? 0 : evaluacion.monto);
  const motivoBloqueo = carrito.lineas.length === 0 ? "Agrega al menos un producto" : evaluacion.error;

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
    if (cliente) datos.set("clienteId", cliente.id);
    if (recibidoEfectivo !== null) datos.set("recibidoEfectivo", String(recibidoEfectivo));
    startTransition(() => formAction(datos));
  }

  return (
    <div className="grid grid-cols-1 gap-4 pb-24 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:pb-0">
      <div className="flex min-w-0 flex-col gap-4">
        {ventaCobrada ? (
          <VentaCobrada venta={ventaCobrada} onNuevaVenta={nuevaVenta} />
        ) : (
          <>
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center justify-between gap-2">
                  <TituloSeccion icono={UserRound}>Cliente</TituloSeccion>
                  <kbd className="font-mono text-xs font-normal text-muted-foreground">F2</kbd>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SelectorCliente cliente={cliente} onCambiar={setCliente} inputRef={clienteRef} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle>
                  <TituloSeccion icono={ShoppingCart}>Productos</TituloSeccion>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TablaCarrito
                  carrito={carrito}
                  buscadorRef={buscadorRef}
                  sinStock={sinStock}
                />
              </CardContent>
            </Card>
          </>
        )}

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
        <Button type="button" size="lg" onClick={() => tarjetaRef.current?.enfocar()}>
          Cobrar
        </Button>
      </div>

      <AyudaAtajos abierta={ayudaAbierta} onCambiar={setAyudaAbierta} />
    </div>
  );
}
