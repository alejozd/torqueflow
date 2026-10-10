import Link from "next/link";
import { Settings, TrendingDown, Wallet } from "lucide-react";
import { listCategoriasGasto } from "@/app/actions/categoria-gasto-actions";
import { listGastos } from "@/app/actions/gasto-actions";
import { listRecurrentesPendientes } from "@/app/actions/gasto-recurrente-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { requireRole } from "@/lib/auth/guards";
import { ETIQUETA_MES } from "@/lib/gastos/periodo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import { FiltrosGastos } from "./filtros-gastos";
import { GastoDialog } from "./gasto-dialog";
import { GastosTable } from "./gastos-table";
import { RecurrentesPendientes } from "./recurrentes-pendientes";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function variacion(total: number, anterior: number): { valor: string; subtitulo?: string } {
  if (anterior === 0) return { valor: "Sin datos del mes anterior" };
  const pct = ((total - anterior) / anterior) * 100;
  const signo = pct > 0 ? "+" : "";
  return { valor: `${signo}${pct.toFixed(1)}%`, subtitulo: `Mes anterior: ${formatoMoneda.format(anterior)}` };
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; sedeId?: string; categoriaId?: string }>;
}) {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const esAdmin = session.user.role === "ADMIN";
  const { periodo, sedeId, categoriaId } = await searchParams;

  // Sequential, never Promise.all: each one goes through requireRole, which
  // redirect()s by throwing.
  const gastos = await listGastos({ periodo, sedeId: sedeId || undefined, categoriaId: categoriaId || undefined });
  const categorias = await listCategoriasGasto({ soloActivas: true });
  const pendientes = await listRecurrentesPendientes({ sedeId: gastos.sedeId });
  const sedes = esAdmin ? await listSedes() : undefined;
  const sedesOpciones = sedes?.map((s) => ({ id: s.id, nombre: s.nombre }));

  const nombreSede =
    sedes?.find((s) => s.id === gastos.sedeId)?.nombre ?? session.user.sedeActivaNombre ?? "";
  const cambio = variacion(gastos.total, gastos.totalMesAnterior);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Gastos</h1>
          <p className="text-sm text-muted-foreground">
            {ETIQUETA_MES(gastos.periodo)} · {nombreSede}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {esAdmin ? (
            <Button variant="outline" render={<Link href="/gastos/configuracion" />}>
              <Settings />
              Configuración
            </Button>
          ) : null}
          <GastoDialog modo="crear" categorias={categorias} sedeIdPorDefecto={gastos.sedeId} sedes={sedesOpciones} />
        </div>
      </div>

      <RecurrentesPendientes pendientes={pendientes} esAdmin={esAdmin} />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <FiltrosGastos
            periodo={gastos.periodo}
            sedeId={gastos.sedeId}
            categoriaId={categoriaId ?? ""}
            sedes={sedesOpciones}
            categorias={categorias}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          title="Total del mes"
          value={formatoMoneda.format(gastos.total)}
          icon={<Wallet className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />
        <KpiCard
          title="vs. mes anterior"
          value={cambio.valor}
          subtitle={cambio.subtitulo}
          icon={<TrendingDown className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />
        <KpiCard
          title="Categoría mayor"
          value={gastos.categoriaMayor?.nombre ?? "—"}
          subtitle={gastos.categoriaMayor ? formatoMoneda.format(gastos.categoriaMayor.monto) : undefined}
          icon={<Wallet className={cn("size-5", KPI_TONE.neutral.icon)} />}
          iconBgColor={KPI_TONE.neutral.iconBg}
          className={KPI_TONE.neutral.cardBg}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gastos del mes</CardTitle>
        </CardHeader>
        <CardContent>
          <GastosTable
            filas={gastos.filas}
            esAdmin={esAdmin}
            categorias={categorias}
            sedeId={gastos.sedeId}
            sedes={sedesOpciones}
          />
        </CardContent>
      </Card>
    </main>
  );
}
