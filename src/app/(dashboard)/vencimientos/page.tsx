import { AlertTriangle, Clock, ShieldAlert } from "lucide-react";
import { listVencimientos } from "@/app/actions/vencimiento-actions";
import { requireSession } from "@/lib/auth/guards";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import { VencimientosTable } from "./vencimientos-table";

export default async function VencimientosPage() {
  const [session, filas] = await Promise.all([requireSession(), listVencimientos()]);
  const puedeAvisar = session.user.role !== "TECNICO";

  const vencidos = filas.filter((fila) => fila.estado === "VENCIDO").length;
  const proximos = filas.filter((fila) => fila.estado === "PROXIMO").length;
  const porVencer = filas.filter((fila) => fila.estado === "POR_VENCER").length;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Vencimientos</h1>
        <p className="text-sm text-muted-foreground">SOAT y revisión técnico-mecánica por vencer o vencidos</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          title="Vencidos"
          value={vencidos}
          valueColor="danger"
          subtitle="documentos vencidos"
          icon={<ShieldAlert className={cn("size-5", KPI_TONE.danger.icon)} />}
          iconBgColor={KPI_TONE.danger.iconBg}
          className={KPI_TONE.danger.cardBg}
        />
        <KpiCard
          title="Vencen en 7 días"
          value={proximos}
          subtitle="requieren aviso ya"
          icon={<AlertTriangle className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />
        <KpiCard
          title="Por vencer"
          value={porVencer}
          subtitle="dentro de la ventana de aviso"
          icon={<Clock className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />
      </div>

      <VencimientosTable filas={filas} puedeAvisar={puedeAvisar} ahora={new Date()} />
    </main>
  );
}
