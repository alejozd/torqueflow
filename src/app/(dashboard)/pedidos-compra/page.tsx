import Link from "next/link";
import { ClipboardList, DollarSign, PackageCheck, Truck } from "lucide-react";
import { listPedidosCompra, type PedidoCompraConDetalle } from "@/app/actions/pedido-compra-actions";
import { EstadoPedidoBadge, ESTADO_PEDIDO_LABELS, totalPedido } from "./estado-pedido";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { formatoFechaCorta, inicioMesBogota } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";
import type { EstadoPedidoCompra } from "@/generated/prisma-tenant";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const ESTADOS: EstadoPedidoCompra[] = ["BORRADOR", "ENVIADO", "RECIBIDO", "CANCELADO"];

const COLUMNS: DataTableColumn<PedidoCompraConDetalle>[] = [
  {
    header: "Pedido",
    cell: (pedido) => <span className="font-mono text-sm font-medium">#{pedido.numero}</span>,
    searchValue: (pedido) => String(pedido.numero),
  },
  {
    header: "Fecha",
    cell: (pedido) => <span className="text-sm">{formatoFechaCorta.format(pedido.createdAt)}</span>,
  },
  {
    header: "Proveedor",
    cell: (pedido) => pedido.proveedor.nombre,
    searchValue: (pedido) => pedido.proveedor.nombre,
  },
  {
    header: "Estado",
    cell: (pedido) => <EstadoPedidoBadge estado={pedido.estado} />,
  },
  {
    header: "Llega",
    cell: (pedido) => (
      <span className="text-sm text-muted-foreground">
        {pedido.estado === "ENVIADO" && pedido.fechaEsperada ? formatoFechaCorta.format(pedido.fechaEsperada) : "—"}
      </span>
    ),
  },
  {
    header: "Ítems",
    className: "text-right",
    cell: (pedido) => <span className="font-mono">{pedido.items.length}</span>,
  },
  {
    header: "Total",
    className: "text-right",
    cell: (pedido) => <span className="font-mono font-medium">{formatoMoneda.format(totalPedido(pedido.items))}</span>,
  },
];

export default async function PedidosCompraPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const estadoActivo = ESTADOS.includes(estado as EstadoPedidoCompra) ? (estado as EstadoPedidoCompra) : undefined;

  // Fetched once, unfiltered: the KPIs summarize every pedido of la sede.
  const pedidos = await listPedidosCompra();
  const filtrados = estadoActivo ? pedidos.filter((pedido) => pedido.estado === estadoActivo) : pedidos;

  const borradores = pedidos.filter((pedido) => pedido.estado === "BORRADOR").length;
  const enCamino = pedidos.filter((pedido) => pedido.estado === "ENVIADO");
  const inicioMes = inicioMesBogota(new Date());
  const recibidosMes = pedidos.filter((pedido) => pedido.estado === "RECIBIDO" && pedido.recibidoAt && pedido.recibidoAt >= inicioMes).length;
  const valorEnCamino = enCamino.reduce((suma, pedido) => suma + totalPedido(pedido.items), 0);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Pedidos de compra</h1>
        <Link href="/#alertas-inventario" className="text-sm text-primary hover:underline">
          Crear desde alertas de inventario →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Borradores"
          value={borradores}
          subtitle={borradores > 0 ? "Pendientes de enviar" : undefined}
          icon={<ClipboardList className={cn("size-5", KPI_TONE.neutral.icon)} />}
          iconBgColor={KPI_TONE.neutral.iconBg}
          className={KPI_TONE.neutral.cardBg}
        />
        <KpiCard
          title="En camino"
          value={enCamino.length}
          icon={<Truck className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />
        <KpiCard
          title="Valor en camino"
          value={formatoMoneda.format(valorEnCamino)}
          valueColor="success"
          icon={<DollarSign className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
        />
        <KpiCard
          title="Recibidos este mes"
          value={recibidosMes}
          icon={<PackageCheck className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
            {[undefined, ...ESTADOS].map((valor) => (
              <Link
                key={valor ?? "todos"}
                href={valor ? `/pedidos-compra?estado=${valor}` : "/pedidos-compra"}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  estadoActivo === valor
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {valor ? ESTADO_PEDIDO_LABELS[valor] : "Todos"}
              </Link>
            ))}
          </nav>

          <DataTable
            columns={COLUMNS}
            rows={filtrados}
            getRowKey={(pedido) => pedido.id}
            rowHref={(pedido) => `/pedidos-compra/${pedido.id}`}
            emptyMessage="No hay pedidos en este filtro. Créalos desde las alertas de inventario del inicio."
            searchable
            searchPlaceholder="Buscar por número o proveedor..."
            pageSize={20}
            headerClassName="bg-muted"
          />
        </CardContent>
      </Card>
    </main>
  );
}
