"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, PackageCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  cancelarPedidoCompraAction,
  enviarPedidoCompraEmailAction,
  recibirPedidoCompraAction,
  registrarEnvioWhatsappPedidoAction,
} from "@/app/actions/pedido-compra-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ItemRecepcion {
  id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
}

export function AccionesPedido({
  pedidoId,
  numero,
  permitidas,
  proveedorTieneEmail,
  urlWhatsapp,
  items,
}: {
  pedidoId: string;
  numero: number;
  permitidas: { enviar: boolean; recibir: boolean; cancelar: boolean };
  proveedorTieneEmail: boolean;
  urlWhatsapp: string | null;
  items: ItemRecepcion[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [recepcionAbierta, setRecepcionAbierta] = useState(false);
  const [recibidos, setRecibidos] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, String(item.cantidad)])),
  );

  function enviarCorreo() {
    startTransition(async () => {
      const resultado = await enviarPedidoCompraEmailAction(pedidoId);
      if (resultado.error) toast.error(resultado.error);
      else toast.success(`Pedido #${numero} enviado por correo`);
    });
  }

  function enviarWhatsapp() {
    if (!urlWhatsapp) return;
    // Must run synchronously in the click handler: popup blockers swallow
    // window.open calls made after an await.
    window.open(urlWhatsapp, "_blank", "noopener");
    startTransition(async () => {
      const resultado = await registrarEnvioWhatsappPedidoAction(pedidoId);
      if (resultado.error) toast.error(resultado.error);
      else toast.success(`Pedido #${numero} marcado como enviado por WhatsApp`);
    });
  }

  function cancelar() {
    startTransition(async () => {
      const resultado = await cancelarPedidoCompraAction(pedidoId);
      setConfirmandoCancelar(false);
      if (resultado.error) toast.error(resultado.error);
      else toast.success(`Pedido #${numero} cancelado`);
    });
  }

  function recibir(evento: React.FormEvent) {
    evento.preventDefault();
    startTransition(async () => {
      const resultado = await recibirPedidoCompraAction(
        pedidoId,
        items.map((item) => ({ itemId: item.id, cantidad: Number(recibidos[item.id] || 0) })),
      );
      if (resultado.error || !resultado.entradaId) {
        toast.error(resultado.error ?? "No se pudo recibir el pedido");
        return;
      }
      toast.success(`Pedido #${numero} recibido: se creó la entrada y se sumó el stock`);
      setRecepcionAbierta(false);
      router.push(`/entradas-mercancia/${resultado.entradaId}`);
    });
  }

  if (!permitidas.enviar && !permitidas.recibir && !permitidas.cancelar) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {permitidas.enviar ? (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={pendiente || !proveedorTieneEmail}
            title={proveedorTieneEmail ? undefined : "El proveedor no tiene correo registrado"}
            onClick={enviarCorreo}
          >
            <Mail />
            Enviar por correo
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pendiente || !urlWhatsapp}
            title={urlWhatsapp ? undefined : "El proveedor no tiene teléfono registrado"}
            onClick={enviarWhatsapp}
          >
            <MessageCircle />
            Enviar por WhatsApp
          </Button>
        </>
      ) : null}

      {permitidas.recibir ? (
        <Dialog open={recepcionAbierta} onOpenChange={setRecepcionAbierta}>
          <DialogTrigger render={<Button type="button" disabled={pendiente} />}>
            <PackageCheck />
            Recibir mercancía
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Recibir pedido #{numero}</DialogTitle>
              <DialogDescription>
                Ajusta lo que llegó realmente; pon 0 en lo que no llegó. Se creará la entrada de mercancía y se sumará el stock.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={recibir} className="flex flex-col gap-4">
              <div className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
                {items.map((item) => (
                  <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-3">
                    <Label htmlFor={`recibido-${item.id}`} className="flex min-w-0 flex-col items-start gap-0.5">
                      <span className="truncate text-sm font-medium">{item.nombre}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.codigo} · pedidas {item.cantidad}
                      </span>
                    </Label>
                    <Input
                      id={`recibido-${item.id}`}
                      type="number"
                      min="0"
                      className="text-right font-mono"
                      value={recibidos[item.id] ?? ""}
                      onChange={(evento) => setRecibidos((actual) => ({ ...actual, [item.id]: evento.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
                <Button type="submit" disabled={pendiente}>
                  {pendiente ? "Recibiendo..." : "Confirmar recepción"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {permitidas.cancelar ? (
        confirmandoCancelar ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            ¿Cancelar el pedido #{numero}?
            <Button type="button" variant="destructive" size="sm" disabled={pendiente} onClick={cancelar}>
              Sí, cancelar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmandoCancelar(false)}>
              No
            </Button>
          </span>
        ) : (
          <Button type="button" variant="ghost" disabled={pendiente} onClick={() => setConfirmandoCancelar(true)}>
            <XCircle />
            Cancelar pedido
          </Button>
        )
      ) : null}
    </div>
  );
}
