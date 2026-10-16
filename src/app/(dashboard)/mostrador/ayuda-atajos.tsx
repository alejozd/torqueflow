"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Atajos del mostrador (spec §4.4). */
export const ATAJOS_MOSTRADOR: { teclas: string; accion: string }[] = [
  { teclas: "F1 o /", accion: "Ir al buscador de productos" },
  { teclas: "↑ / ↓ · Enter", accion: "Moverse en los resultados · agregar" },
  { teclas: "↓ desde el buscador vacío", accion: "Ir a la primera fila del carrito" },
  { teclas: "+ / − en una fila", accion: "Subir / bajar la cantidad" },
  { teclas: "Supr en una fila", accion: "Quitar (Enter confirma, Esc cancela)" },
  { teclas: "F2", accion: "Buscar / cambiar cliente" },
  { teclas: "F4", accion: "Descuento" },
  { teclas: "F9 o Ctrl+Enter", accion: "Ir a cobrar / cobrar si ya está en el cobro" },
  { teclas: "Esc", accion: "Limpiar el buscador" },
  { teclas: "?", accion: "Mostrar esta lista" },
];

/** Lista de atajos que abre la tecla `?`. */
export function AyudaAtajos({ abierta, onCambiar }: { abierta: boolean; onCambiar: (abierta: boolean) => void }) {
  return (
    <Dialog open={abierta} onOpenChange={onCambiar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>Para vender sin soltar el teclado ni el lector de códigos.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {ATAJOS_MOSTRADOR.map((atajo) => (
            <div key={atajo.teclas} className="contents">
              <dt>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{atajo.teclas}</kbd>
              </dt>
              <dd className="text-muted-foreground">{atajo.accion}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
