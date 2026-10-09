import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, DollarSign, Package, Truck } from "lucide-react";
import { getEnlaceWhatsappPedido, getPedidoCompra, type PedidoCompraConDetalle } from "@/app/actions/pedido-compra-actions";
import { accionesPermitidas } from "@/lib/pedido-compra/pedido-compra";
import { AccionesPedido } from "./acciones-pedido";
import { EstadoPedidoBadge, totalPedido } from "../estado-pedido";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { formatoFechaCorta } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

type ItemRow = PedidoCompraConDetalle["items"][number];

const ITEMS_COLUMNS: DataTableColumn<ItemRow>[] = [
  {
    header: "Repuesto",
    cell: (item) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{item.repuesto.nombre}</span>
        <span className="font-mono text-xs text-muted-foreground">{item.repuesto.codigo}</span>
      </div>
    ),
  },
  {
    header: "Cantidad",
    className: "text-center",
    cell: (item) => <span className="font-mono text-sm">{item.cantidad}</span>,
  },
  {
    header: "Costo unitario",
    className: "text-right",
    cell: (item) => (
      <span className="font-mono text-sm text-muted-foreground">{formatoMoneda.format(Number(item.precioCompraUnitario))}</span>
    ),
  },
  {
    header: "Subtotal",
    className: "text-right",
    cell: (item) => (
      <span className="font-mono text-sm font-medium">
        {formatoMoneda.format(item.cantidad * Number(item.precioCompraUnitario))}
      </span>
    ),
  },
];

export default async function PedidoCompraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pedido = await getPedidoCompra(id);
  if (!pedido) notFound();

  const permitidas = accionesPermitidas(pedido.estado);
  const urlWhatsapp = permitidas.enviar ? await getEnlaceWhatsappPedido(id) : null;
  const unidades = pedido.items.reduce((suma, item) => suma + item.cantidad, 0);

  const entrega =
    pedido.estado === "RECIBIDO" && pedido.recibidoAt
      ? { titulo: "Recibido", valor: formatoFechaCorta.format(pedido.recibidoAt) }
      : pedido.fechaEsperada
        ? { titulo: "Llega aprox.", valor: formatoFechaCorta.format(pedido.fechaEsperada) }
        : {
            titulo: "Tiempo de entrega",
            valor: `${pedido.proveedor.diasEntrega} ${pedido.proveedor.diasEntrega === 1 ? "día" : "días"}`,
          };

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/pedidos-compra"
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        ← Pedidos de compra
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">Pedido de compra #{pedido.numero}</h1>
            <EstadoPedidoBadge estado={pedido.estado} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatoFechaCorta.format(pedido.createdAt)} · {pedido.proveedor.nombre} · {pedido.bodega.nombre} · creó{" "}
            {pedido.creadoPor.nombre}
            {pedido.enviadoAt && pedido.canal
              ? ` · enviado por ${pedido.canal === "EMAIL" ? "correo" : "WhatsApp"} el ${formatoFechaCorta.format(pedido.enviadoAt)}`
              : ""}
          </p>
        </div>
        <AccionesPedido
          pedidoId={pedido.id}
          numero={pedido.numero}
          permitidas={permitidas}
          proveedorTieneEmail={Boolean(pedido.proveedor.email)}
          urlWhatsapp={urlWhatsapp}
          items={pedido.items.map((item) => ({
            id: item.id,
            codigo: item.repuesto.codigo,
            nombre: item.repuesto.nombre,
            cantidad: item.cantidad,
          }))}
        />
      </div>

      {pedido.entradaId ? (
        <p className="text-sm">
          Se recibió en la{" "}
          <Link href={`/entradas-mercancia/${pedido.entradaId}`} className="text-primary hover:underline">
            entrada de mercancía #{pedido.entradaId.slice(-8).toUpperCase()}
          </Link>
          .
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Referencias"
          value={pedido.items.length}
          subtitle="repuestos distintos"
          icon={<Package className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />
        <KpiCard
          title="Unidades"
          value={unidades}
          subtitle="en total"
          icon={<Truck className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />
        <KpiCard
          title="Total estimado"
          value={formatoMoneda.format(totalPedido(pedido.items))}
          valueColor="success"
          subtitle="al último precio de compra"
          icon={<DollarSign className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
        />
        <KpiCard
          title={entrega.titulo}
          value={entrega.valor}
          subtitle={[pedido.proveedor.telefono, pedido.proveedor.email].filter(Boolean).join(" · ") || "Proveedor sin contacto"}
          icon={<CalendarClock className={cn("size-5", KPI_TONE.purple.icon)} />}
          iconBgColor={KPI_TONE.purple.iconBg}
          className={KPI_TONE.purple.cardBg}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ítems</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={ITEMS_COLUMNS}
            rows={pedido.items}
            getRowKey={(item) => item.id}
            emptyMessage="Este pedido no tiene ítems."
            headerClassName="bg-muted"
          />
        </CardContent>
      </Card>
    </main>
  );
}
