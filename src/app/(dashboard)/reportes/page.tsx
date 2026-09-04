import { FileText, Package, Percent, Receipt, TrendingUp, Wrench } from "lucide-react";
import {
  getReporteProductividad,
  getReporteRentabilidad,
  type ReporteFiltros,
} from "@/app/actions/reporte-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { rangoMesActual } from "@/lib/reportes/rango-fechas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { DataTable, type DataTableColumn } from "@/components/data-table";

type FilaProductividad = Awaited<ReturnType<typeof getReporteProductividad>>["filas"][number];

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const COLUMNS: DataTableColumn<FilaProductividad>[] = [
  { header: "Técnico", cell: (fila) => fila.mecanicoNombre },
  {
    header: "Órdenes entregadas",
    className: "text-right",
    cell: (fila) => <span className="font-mono">{fila.ordenesCompletadas}</span>,
  },
  {
    header: "Mano de obra",
    className: "text-right",
    cell: (fila) => <span className="font-mono font-medium">{formatoMoneda.format(fila.montoManoDeObra)}</span>,
  },
];

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sedeId?: string }>;
}) {
  const { desde, hasta, sedeId } = await searchParams;
  const porDefecto = rangoMesActual(new Date());
  const filtros: ReporteFiltros = {
    desde: desde || porDefecto.desde,
    hasta: hasta || porDefecto.hasta,
    sedeId: sedeId || undefined,
  };

  // Sequential, never Promise.all: all three go through requireRole, which
  // redirect()s by throwing (Fase 5 Task 9's deliberate choice).
  const rentabilidad = await getReporteRentabilidad(filtros);
  const productividad = await getReporteProductividad(filtros);
  const sedes = await listSedes();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Reportes</h1>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" action="/reportes" className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="desde">Desde</Label>
              <Input id="desde" name="desde" type="date" defaultValue={filtros.desde} required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hasta">Hasta</Label>
              <Input id="hasta" name="hasta" type="date" defaultValue={filtros.hasta} required />
            </div>

            {/*
              Fase 6: a real selector replaces Fase 5's hidden input. It defaults to
              whatever the actions resolved (the sede activa when the URL carries
              none), so an ADMIN can compare any sede without re-logging-in --
              reading another sede's numbers is safe in a way that operating in it
              is not.

              This selector now renders via SelectField (shadcn/Base UI select)
              instead of a native <select>.
            */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sedeId">Sede</Label>
              <SelectField
                id="sedeId"
                name="sedeId"
                defaultValue={rentabilidad.filtros.sedeId}
                items={sedes.map((sede) => ({ value: sede.id, label: sede.nombre }))}
              />
            </div>

            <Button type="submit">Aplicar</Button>
          </form>

          {rentabilidad.error ? (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{rentabilidad.error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rentabilidad</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Rango: {rentabilidad.filtros.desde} a {rentabilidad.filtros.hasta}
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <KpiCard
              title="Facturas emitidas"
              value={rentabilidad.totales.facturasCount}
              icon={<FileText className={cn("size-5", KPI_TONE.info.icon)} />}
              iconBgColor={KPI_TONE.info.iconBg}
              className={KPI_TONE.info.cardBg}
            />
            <KpiCard
              title="Total facturado"
              value={rentabilidad.totales.totalFacturado}
              valueColor="success"
              icon={<Receipt className={cn("size-5", KPI_TONE.success.icon)} />}
              iconBgColor={KPI_TONE.success.iconBg}
              className={KPI_TONE.success.cardBg}
            />
            <KpiCard
              title="Costo de repuestos"
              value={rentabilidad.totales.costoRepuestos}
              icon={<Package className={cn("size-5", KPI_TONE.neutral.icon)} />}
              iconBgColor={KPI_TONE.neutral.iconBg}
              className={KPI_TONE.neutral.cardBg}
            />
            <KpiCard
              title="Margen bruto"
              value={rentabilidad.totales.margen}
              valueColor="success"
              icon={<TrendingUp className={cn("size-5", KPI_TONE.success.icon)} />}
              iconBgColor={KPI_TONE.success.iconBg}
              className={KPI_TONE.success.cardBg}
            />
            <KpiCard
              title="Margen bruto (%)"
              value={rentabilidad.totales.margenPorcentaje}
              valueColor="success"
              icon={<Percent className={cn("size-5", KPI_TONE.success.icon)} />}
              iconBgColor={KPI_TONE.success.iconBg}
              className={KPI_TONE.success.cardBg}
            />
            <KpiCard
              title="Mano de obra facturada"
              value={rentabilidad.totales.manoDeObraFacturada}
              icon={<Wrench className={cn("size-5", KPI_TONE.info.icon)} />}
              iconBgColor={KPI_TONE.info.iconBg}
              className={KPI_TONE.info.cardBg}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productividad por técnico</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={productividad.filas}
            getRowKey={(fila) => fila.mecanicoId ?? "sin-asignar"}
            emptyMessage="No hay órdenes entregadas en este rango."
          />
        </CardContent>
      </Card>
    </main>
  );
}
