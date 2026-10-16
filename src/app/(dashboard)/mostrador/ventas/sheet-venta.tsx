"use client";

import type { VentaMostradorFila } from "@/app/actions/venta-mostrador-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ETIQUETA_ESTADO_VENTA, quedaPorDevolver } from "@/lib/mostrador/listado-ventas";
import { formatoFechaHoraBogota } from "@/lib/mostrador/comprobante";
import { CobrarVentaForm } from "../cobrar-venta-form";
import { DevolucionForm } from "../devolucion-form";
import type { AccionVenta } from "../pestanas-mostrador";
import { urlComprobante } from "../venta-cobrada";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const pesos = (valor: number) => formatoMoneda.format(valor);

const TITULO: Record<AccionVenta, string> = {
  ver: "Venta",
  cobrar: "Cobrar saldo de la venta",
  devolver: "Devolver de la venta",
};

/**
 * Panel lateral de una venta: ver su detalle, cobrar su saldo (el mismo
 * formulario de siempre) o devolver parte de ella. Cobrar no tiene plazo; la
 * devolución sí (30 días; de una caja cerrada solo ADMIN) y aquí se dice por qué.
 */
export function SheetVenta({
  abierta,
  venta,
  cargando,
  onCambiarAccion,
  onCerrar,
}: {
  abierta: { ventaId: string; accion: AccionVenta } | null;
  venta: VentaMostradorFila | null;
  cargando: boolean;
  onCambiarAccion: (accion: AccionVenta) => void;
  onCerrar: () => void;
}) {
  const accion = abierta?.accion ?? "ver";

  return (
    <Sheet open={abierta !== null} onOpenChange={(abrir) => (abrir ? undefined : onCerrar())}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {TITULO[accion]} {venta ? <span className="font-mono">#{venta.numero}</span> : null}
          </SheetTitle>
          <SheetDescription>
            {venta
              ? `${venta.clienteNombre ?? "Consumidor final"} · ${formatoFechaHoraBogota.format(venta.createdAt)}`
              : cargando
                ? "Cargando la venta..."
                : "No se encontró esta venta en tu sede."}
          </SheetDescription>
        </SheetHeader>

        {venta ? (
          <div className="flex flex-col gap-4 px-4 pb-4">
            {accion === "ver" ? <DetalleVenta venta={venta} onCambiarAccion={onCambiarAccion} /> : null}

            {accion === "cobrar" ? (
              venta.saldoPendiente > 0 ? (
                <>
                  <p className="text-sm">
                    Saldo pendiente <span className="font-mono font-semibold">{pesos(venta.saldoPendiente)}</span> de{" "}
                    <span className="font-mono">{pesos(venta.total)}</span>.
                  </p>
                  <CobrarVentaForm key={`${venta.id}-${venta.saldoPendiente}`} ventaId={venta.id} saldo={venta.saldoPendiente} />
                </>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  Esta venta ya está pagada.
                </p>
              )
            ) : null}

            {accion === "devolver" ? (
              venta.devolucion.permitido ? (
                <DevolucionForm key={venta.id} venta={venta} />
              ) : (
                <Alert>
                  <AlertDescription>{venta.devolucion.motivo}</AlertDescription>
                </Alert>
              )
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetalleVenta({
  venta,
  onCambiarAccion,
}: {
  venta: VentaMostradorFila;
  onCambiarAccion: (accion: AccionVenta) => void;
}) {
  return (
    <>
      <ul className="flex flex-col divide-y rounded-md border text-sm">
        {venta.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 p-2">
            <span>
              {item.descripcion} <span className="text-muted-foreground">×{item.cantidad}</span>
              {item.devueltoCantidad > 0 ? (
                <span className="block text-xs text-muted-foreground">Devueltas {item.devueltoCantidad}</span>
              ) : null}
            </span>
            <span className="font-mono">{pesos(item.cantidad * item.precioUnitario)}</span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Total</dt>
        <dd className="text-right font-mono font-semibold">{pesos(venta.total)}</dd>
        <dt className="text-muted-foreground">Pagó con</dt>
        <dd className="text-right">{venta.metodos}</dd>
        <dt className="text-muted-foreground">Saldo</dt>
        <dd className="text-right font-mono">{pesos(venta.saldoPendiente)}</dd>
        {venta.totalDevuelto > 0 ? (
          <>
            <dt className="text-muted-foreground">Devuelto</dt>
            <dd className="text-right font-mono">{pesos(venta.totalDevuelto)}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Estado</dt>
        <dd className="text-right">{ETIQUETA_ESTADO_VENTA[venta.estado]}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        {venta.saldoPendiente > 0 ? (
          <Button type="button" size="sm" onClick={() => onCambiarAccion("cobrar")}>
            Cobrar saldo
          </Button>
        ) : null}
        {quedaPorDevolver(venta.items) && venta.devolucion.permitido ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onCambiarAccion("devolver")}>
            Devolver
          </Button>
        ) : null}
        <a
          href={urlComprobante({ ventaId: venta.id }, true)}
          target="_blank"
          rel="noopener"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Imprimir comprobante
        </a>
      </div>
      {quedaPorDevolver(venta.items) && !venta.devolucion.permitido ? (
        <p className="text-xs text-muted-foreground">{venta.devolucion.motivo}</p>
      ) : null}
    </>
  );
}
