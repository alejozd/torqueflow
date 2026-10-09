import type { EstadoPedidoCompra } from "@/generated/prisma-tenant";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const ESTADO_PEDIDO_LABELS: Record<EstadoPedidoCompra, string> = {
  BORRADOR: "Borrador",
  ENVIADO: "En camino",
  RECIBIDO: "Recibido",
  CANCELADO: "Cancelado",
};

// Same tinted dot-in-pill standard as the rest of the app's estado badges:
// borrador neutral, en camino blue (info, like the dashboard's "En el taller"),
// recibido green, cancelado red.
const ESTADO_PEDIDO_TONO: Record<EstadoPedidoCompra, { dot: string; badge: string }> = {
  BORRADOR: { dot: "bg-gray-400", badge: "bg-gray-50 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300" },
  ENVIADO: { dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  RECIBIDO: { dot: "bg-green-500", badge: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  CANCELADO: { dot: "bg-red-500", badge: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};

export function EstadoPedidoBadge({ estado }: { estado: EstadoPedidoCompra }) {
  return (
    <Badge className={cn("gap-1.5", ESTADO_PEDIDO_TONO[estado].badge)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", ESTADO_PEDIDO_TONO[estado].dot)} />
      {ESTADO_PEDIDO_LABELS[estado]}
    </Badge>
  );
}

export function totalPedido(items: { cantidad: number; precioCompraUnitario: unknown }[]): number {
  return items.reduce((suma, item) => suma + item.cantidad * Number(item.precioCompraUnitario), 0);
}
