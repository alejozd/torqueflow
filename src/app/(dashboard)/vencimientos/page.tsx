import Link from "next/link";
import { AlertTriangle, Clock, Settings, ShieldAlert } from "lucide-react";
import { getDiasAvisoVencimiento } from "@/app/actions/configuracion-taller-actions";
import { listVencimientos } from "@/app/actions/vencimiento-actions";
import { DIAS_PROXIMO } from "@/lib/vencimientos/estado-vencimiento";
import { puede, requireSession } from "@/lib/auth/guards";
import { buttonVariants } from "@/components/ui/button";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import { VencimientosTable } from "./vencimientos-table";

export default async function VencimientosPage() {
  const [session, filas, diasAviso] = await Promise.all([
    requireSession(),
    listVencimientos(),
    getDiasAvisoVencimiento(),
  ]);
  const puedeAvisar = puede(session, "vencimientos.avisar");
  // /configuracion-smtp exige configuracion.taller (getConfiguracionSmtp -> requirePermiso).
  const puedeConfigurar = puede(session, "configuracion.taller");

  const vencidos = filas.filter((fila) => fila.estado === "VENCIDO").length;
  const proximos = filas.filter((fila) => fila.estado === "PROXIMO").length;
  const porVencer = filas.filter((fila) => fila.estado === "POR_VENCER").length;
  // PROXIMO cubre hasta min(7, diasAviso) días; POR_VENCER, del día 8 al aviso.
  // Con un aviso de 7 días o menos no existe ese tramo, así que no se muestra.
  const diasProximo = Math.min(DIAS_PROXIMO, diasAviso);
  const hayTramoPorVencer = diasAviso > DIAS_PROXIMO;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Vencimientos</h1>
          <p className="text-sm text-muted-foreground">SOAT y revisión técnico-mecánica próximos a vencer o vencidos</p>
        </div>
        {puedeConfigurar ? (
          <Link href="/configuracion-smtp" className={buttonVariants({ variant: "outline" })}>
            <Settings data-icon="inline-start" />
            Configurar alertas
          </Link>
        ) : null}
      </div>

      <div className={cn("grid grid-cols-1 gap-4", hayTramoPorVencer ? "md:grid-cols-3" : "md:grid-cols-2")}>
        <KpiCard
          title="Vencidos"
          value={vencidos}
          valueColor="danger"
          subtitle="documentos vencidos sin renovar"
          icon={<ShieldAlert className={cn("size-5", KPI_TONE.danger.icon)} />}
          iconBgColor={KPI_TONE.danger.iconBg}
          className={KPI_TONE.danger.cardBg}
        />
        <KpiCard
          title={`Vencen en ${diasProximo} ${diasProximo === 1 ? "día" : "días"}`}
          value={proximos}
          subtitle="requieren aviso ya"
          icon={<AlertTriangle className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />
        {hayTramoPorVencer ? (
          <KpiCard
            title={`Vencen en ${DIAS_PROXIMO + 1} a ${diasAviso} días`}
            value={porVencer}
            subtitle="dentro de la ventana de aviso"
            icon={<Clock className={cn("size-5", KPI_TONE.info.icon)} />}
            iconBgColor={KPI_TONE.info.iconBg}
            className={KPI_TONE.info.cardBg}
          />
        ) : null}
      </div>

      <VencimientosTable filas={filas} puedeAvisar={puedeAvisar} ahora={new Date()} />
    </main>
  );
}
