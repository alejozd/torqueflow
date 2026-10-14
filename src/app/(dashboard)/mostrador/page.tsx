import { getMostradorDatos } from "@/app/actions/venta-mostrador-actions";
import { Badge } from "@/components/ui/badge";
import { BotonExportar } from "@/components/boton-exportar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { CarritoMostrador } from "./carrito-mostrador";
import { CobrarVentaForm } from "./cobrar-venta-form";
import { DevolucionForm } from "./devolucion-form";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoHora = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });

export default async function MostradorPage() {
  const { efectivoBloqueado, repuestos, clientes, ventas } = await getMostradorDatos();

  const columnas: DataTableColumn<(typeof ventas)[number]>[] = [
    { header: "Venta", cell: (venta) => <span className="font-mono">#{venta.numero}</span> },
    { header: "Hora", cell: (venta) => formatoHora.format(venta.createdAt) },
    { header: "Cliente", cell: (venta) => venta.clienteNombre ?? "Consumidor final" },
    { header: "Total", className: "text-right", cell: (venta) => <span className="font-mono">{formatoMoneda.format(venta.total)}</span> },
    {
      header: "Saldo",
      className: "text-right",
      cell: (venta) => (
        <span className={venta.saldoPendiente > 0 ? "font-mono font-medium text-amber-600" : "font-mono"}>
          {formatoMoneda.format(venta.saldoPendiente)}
        </span>
      ),
    },
    {
      header: "Estado",
      cell: (venta) => <Badge variant="outline">{venta.estado === "PAGADA" ? "Pagada" : "A crédito"}</Badge>,
    },
  ];

  const ventasACredito = ventas.filter((venta) => venta.saldoPendiente > 0);
  const ventasConDevolvibles = ventas.filter((venta) =>
    venta.items.some((item) => item.cantidad > item.devueltoCantidad),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mostrador</h1>
          <p className="text-sm text-muted-foreground">
            Vende lo que hay en inventario sin abrir una orden de trabajo. El stock se descuenta al vender y el cobro entra
            en el arqueo de la caja abierta.
          </p>
        </div>
        <BotonExportar reporte="ventas-hoy" etiqueta="Exportar ventas de hoy" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva venta</CardTitle>
          <CardDescription>
            Busca el repuesto, ajusta cantidades y cobra. Las unidades libres ya descuentan lo comprometido en
            órdenes abiertas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CarritoMostrador repuestos={repuestos} clientes={clientes} efectivoBloqueado={efectivoBloqueado} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ventas de hoy</CardTitle>
          <CardDescription>Lo vendido hoy en esta sede, con lo que quede a crédito.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DataTable
            columns={columnas}
            rows={ventas}
            getRowKey={(venta) => venta.id}
            emptyMessage="Todavía no hay ventas de mostrador hoy."
          />
          {ventasACredito.length > 0 ? (
            <div className="flex flex-col gap-3 border-t pt-4">
              <h3 className="text-sm font-medium">Cobrar ventas a crédito</h3>
              {ventasACredito.map((venta) => (
                <div key={venta.id} className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm">#{venta.numero}</span>
                  <span className="text-sm text-muted-foreground">{venta.clienteNombre ?? "Consumidor final"}</span>
                  <CobrarVentaForm ventaId={venta.id} saldo={venta.saldoPendiente} />
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Devoluciones</CardTitle>
          <CardDescription>
            Devolver una venta saca el dinero del cajón y devuelve el stock. Si la venta estaba a crédito, primero baja
            la deuda.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {ventasConDevolvibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay ventas de hoy con algo por devolver.</p>
          ) : (
            ventasConDevolvibles.map((venta) => (
              <details key={venta.id} className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm">
                  Venta <span className="font-mono">#{venta.numero}</span> ·{" "}
                  {formatoMoneda.format(venta.total)} · {venta.clienteNombre ?? "Consumidor final"}
                </summary>
                <div className="pt-3">
                  <DevolucionForm venta={venta} />
                </div>
              </details>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
