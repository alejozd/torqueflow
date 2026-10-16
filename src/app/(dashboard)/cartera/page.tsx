import { AlertCircle, Clock, Wallet } from "lucide-react";
import { getCartera } from "@/app/actions/cartera-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { requireRole } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { BotonExportar } from "@/components/boton-exportar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";
import { CarteraTable } from "./cartera-table";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export default async function CarteraPage({ searchParams }: { searchParams: Promise<{ sedeId?: string }> }) {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const esAdmin = session.user.role === "ADMIN";
  const { sedeId } = await searchParams;

  // Sequential, never Promise.all: both go through requireRole, which
  // redirect()s by throwing.
  const cartera = await getCartera({ sedeId: sedeId || undefined });
  const sedes = esAdmin ? await listSedes() : undefined;
  const nombreSede = sedes?.find((s) => s.id === cartera.sedeId)?.nombre ?? session.user.sedeActivaNombre ?? "";
  const { totales } = cartera;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Cartera</h1>
          <p className="text-sm text-muted-foreground">
            {nombreSede} · {cartera.clientes.length} {cartera.clientes.length === 1 ? "cliente" : "clientes"} con saldo
          </p>
        </div>
        {sedes ? (
          <form method="get" action="/cartera" className="flex items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sedeId">Sede</Label>
              <SelectField
                id="sedeId"
                name="sedeId"
                defaultValue={cartera.sedeId}
                items={sedes.map((s) => ({ value: s.id, label: s.nombre }))}
              />
            </div>
            <Button type="submit">Aplicar</Button>
          </form>
        ) : null}
        <BotonExportar reporte="cartera" etiqueta="Exportar a Excel" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="Total en cartera"
          value={formatoMoneda.format(totales.total)}
          valueColor="warning"
          icon={<Wallet className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />
        <KpiCard
          title="0–30 días"
          value={formatoMoneda.format(totales["0-30"])}
          icon={<Clock className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />
        <KpiCard
          title="31–60 días"
          value={formatoMoneda.format(totales["31-60"])}
          icon={<Clock className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />
        <KpiCard
          title="61–90 días"
          value={formatoMoneda.format(totales["61-90"])}
          valueColor="warning"
          icon={<Clock className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />
        <KpiCard
          title="Más de 90 días"
          value={formatoMoneda.format(totales["90+"])}
          valueColor="danger"
          highlight={totales["90+"] > 0}
          icon={<AlertCircle className={cn("size-5", KPI_TONE.danger.icon)} />}
          iconBgColor={KPI_TONE.danger.iconBg}
          className={KPI_TONE.danger.cardBg}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saldos por cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <CarteraTable clientes={cartera.clientes} puedeCobrarMostrador={cartera.sedeId === session.user.sedeActivaId} />
        </CardContent>
      </Card>
    </main>
  );
}
