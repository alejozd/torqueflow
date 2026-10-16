"use client";

import { IconoWhatsapp } from "@/components/icono-whatsapp";
import { useEffect, useRef, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { enviarComprobanteCorreoAction } from "@/app/actions/venta-mostrador-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PagoEntrada } from "@/lib/mostrador/cobro";
import { describirMetodos } from "@/lib/mostrador/comprobante";
import { usePestanaMostrador } from "./pestanas-mostrador";
import { estaEscribiendo } from "./use-atajos-mostrador";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const pesos = (valor: number) => formatoMoneda.format(valor);

export interface VentaCobradaDatos {
  ventaId: string;
  numero: number;
  total: number;
  pagos: PagoEntrada[];
  vueltas: number;
  saldoPendiente: number;
  /** null = Consumidor final. */
  cliente: { nombre: string; correo: string | null } | null;
  /** wa.me con el comprobante; null si el cliente no tiene teléfono. */
  urlWhatsapp: string | null;
}

/** Ruta imprimible; lo recibido y las vueltas se leen de la venta guardada. */
export function urlComprobante(venta: Pick<VentaCobradaDatos, "ventaId">, imprimir = false): string {
  return `/mostrador/${venta.ventaId}/comprobante${imprimir ? "?imprimir=1" : ""}`;
}

/**
 * Tarjeta de venta cobrada (spec §3.3): reemplaza al carrito tras cobrar.
 * Enter = nueva venta (el botón arranca con el foco); P o Ctrl+P = imprimir el
 * comprobante. WhatsApp solo si el cliente tiene teléfono y correo solo si
 * tiene correo (se manda por el SMTP del taller). "Devolver algo de esta venta"
 * lleva a la pestaña Ventas con su devolución abierta; allá Enter y P no aplican.
 */
export function VentaCobrada({ venta, onNuevaVenta }: { venta: VentaCobradaDatos; onNuevaVenta: () => void }) {
  const nuevaRef = useRef<HTMLButtonElement>(null);
  const [enviando, startTransition] = useTransition();
  const { activa, abrirVenta } = usePestanaMostrador();
  const accionesRef = useRef({ onNuevaVenta, venta, activa });
  useEffect(() => {
    accionesRef.current = { onNuevaVenta, venta, activa };
  });

  useEffect(() => {
    nuevaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.metaKey) return;
      const { onNuevaVenta: nueva, venta: actual, activa: pestana } = accionesRef.current;
      if (pestana !== "vender") return;
      const destino = event.target instanceof HTMLElement ? event.target : null;
      // Enter sobre otro botón o enlace hace lo suyo; en el resto de la página es "nueva venta".
      if (event.key === "Enter" && !event.ctrlKey && !estaEscribiendo(destino) && !destino?.closest("button, a")) {
        event.preventDefault();
        nueva();
      } else if ((event.key === "p" || event.key === "P") && (event.ctrlKey || !estaEscribiendo(destino))) {
        event.preventDefault();
        window.open(urlComprobante(actual, true), "_blank", "noopener");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function enviarCorreo() {
    startTransition(async () => {
      const resultado = await enviarComprobanteCorreoAction(venta.ventaId);
      if (resultado.success) toast.success(`Comprobante enviado a ${venta.cliente?.correo}`);
      else toast.error(resultado.error ?? "No se pudo enviar el comprobante");
    });
  }

  const conSaldo = venta.saldoPendiente > 0;
  const detalle = [
    venta.cliente?.nombre ?? "Consumidor final",
    pesos(venta.total),
    describirMetodos(venta.pagos),
    ...(venta.vueltas > 0 ? [`Vueltas ${pesos(venta.vueltas)}`] : []),
    ...(conSaldo ? [`Queda debiendo ${pesos(venta.saldoPendiente)}`] : []),
  ].join(" · ");

  return (
    <Card role="status" aria-label={`Venta #${venta.numero} ${conSaldo ? "registrada" : "cobrada"}`} className="ring-emerald-500/30">
      <CardContent className="flex items-start gap-3">
        <div
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
        >
          <Check className="size-5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-semibold">
            Venta <span className="font-mono">#{venta.numero}</span> {conSaldo ? "registrada" : "cobrada"}
          </p>
          <p data-testid="detalle-venta" className="text-sm text-muted-foreground">
            {detalle}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button ref={nuevaRef} type="button" onClick={onNuevaVenta}>
              Nueva venta
              <kbd aria-hidden className="ml-1 font-mono text-xs opacity-70">
                Enter
              </kbd>
            </Button>
            <a
              href={urlComprobante(venta, true)}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "outline" })}
            >
              Imprimir comprobante
              <kbd aria-hidden className="ml-1 font-mono text-xs opacity-70">
                P
              </kbd>
            </a>
            {venta.urlWhatsapp ? (
              <a
                href={venta.urlWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <IconoWhatsapp className="size-4" />
                Enviar por WhatsApp
              </a>
            ) : null}
            {venta.cliente?.correo ? (
              <Button type="button" variant="outline" disabled={enviando} onClick={enviarCorreo}>
                {enviando ? "Enviando..." : "Enviar por correo"}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => abrirVenta(venta.ventaId, "devolver")}>
              Devolver algo de esta venta
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
