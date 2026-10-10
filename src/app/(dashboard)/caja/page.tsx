import { Banknote, CreditCard, Landmark, TrendingDown } from "lucide-react";
import { getCajaActual, listCajasCerradas } from "@/app/actions/caja-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { requireRole } from "@/lib/auth/guards";
import { periodoActualBogota } from "@/lib/gastos/periodo";
import { periodoSchema } from "@/lib/validation/gasto";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import { AbrirCajaForm } from "./abrir-caja-form";
import { HistorialCajasTable, MovimientosTable } from "./caja-tablas";
import { CerrarCajaForm } from "./cerrar-caja-form";
import { FiltrosCaja } from "./filtros-caja";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoFechaHora = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ sedeId?: string; periodo?: string }>;
}) {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const esAdmin = session.user.role === "ADMIN";
  const { sedeId: sedePedida, periodo: periodoPedido } = await searchParams;
  const periodo = periodoSchema.safeParse(periodoPedido).success
    ? (periodoPedido as string)
    : periodoActualBogota(new Date());

  // Sequential, never Promise.all: each one goes through requireRole, which
  // redirect()s by throwing.
  const actual = await getCajaActual({ sedeId: sedePedida || undefined });
  const historial = await listCajasCerradas({ sedeId: actual.sedeId, periodo });
  const sedes = esAdmin ? await listSedes() : undefined;
  const sedesOpciones = sedes?.map((s) => ({ id: s.id, nombre: s.nombre }));
  const nombreSede = sedes?.find((s) => s.id === actual.sedeId)?.nombre ?? session.user.sedeActivaNombre ?? "";
  const { caja, resumen } = actual;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Caja</h1>
        <p className="text-sm text-muted-foreground">{nombreSede}</p>
      </div>

      {!caja || !resumen ? (
        <>
          <Alert>
            <AlertTitle>La caja está cerrada</AlertTitle>
            <AlertDescription>
              Los pagos y anticipos se registran igual, pero no quedan en un arqueo hasta que abras la caja.
            </AlertDescription>
          </Alert>
          <Card>
            <CardHeader>
              <CardTitle>Abrir caja</CardTitle>
            </CardHeader>
            <CardContent>
              <AbrirCajaForm sedeId={actual.sedeId} />
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Abierta el {formatoFechaHora.format(caja.abiertaAt)} por {caja.abiertaPorNombre}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Base inicial"
              value={formatoMoneda.format(caja.baseInicial)}
              icon={<Landmark className={cn("size-5", KPI_TONE.neutral.icon)} />}
              iconBgColor={KPI_TONE.neutral.iconBg}
              className={KPI_TONE.neutral.cardBg}
            />
            <KpiCard
              title="Ingresos"
              value={formatoMoneda.format(resumen.totalIngresos)}
              subtitle={`Efectivo ${formatoMoneda.format(resumen.ingresosPorMetodo.EFECTIVO)} · Tarjeta ${formatoMoneda.format(resumen.ingresosPorMetodo.TARJETA)} · Transferencia ${formatoMoneda.format(resumen.ingresosPorMetodo.TRANSFERENCIA)} · Otro ${formatoMoneda.format(resumen.ingresosPorMetodo.OTRO)}`}
              icon={<CreditCard className={cn("size-5", KPI_TONE.success.icon)} />}
              iconBgColor={KPI_TONE.success.iconBg}
              className={KPI_TONE.success.cardBg}
            />
            <KpiCard
              title="Egresos en efectivo"
              value={formatoMoneda.format(resumen.egresosEfectivo)}
              subtitle="Gastos en efectivo y devoluciones"
              icon={<TrendingDown className={cn("size-5", KPI_TONE.warning.icon)} />}
              iconBgColor={KPI_TONE.warning.iconBg}
              className={KPI_TONE.warning.cardBg}
            />
            <KpiCard
              title="Efectivo esperado"
              value={formatoMoneda.format(resumen.efectivoEsperado)}
              icon={<Banknote className={cn("size-5", KPI_TONE.info.icon)} />}
              iconBgColor={KPI_TONE.info.iconBg}
              className={KPI_TONE.info.cardBg}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Movimientos</CardTitle>
            </CardHeader>
            <CardContent>
              <MovimientosTable filas={actual.movimientos} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cerrar caja</CardTitle>
            </CardHeader>
            <CardContent>
              <CerrarCajaForm cajaId={caja.id} efectivoEsperado={resumen.efectivoEsperado} />
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial de cierres</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FiltrosCaja periodo={periodo} sedeId={actual.sedeId} sedes={sedesOpciones} />
          <HistorialCajasTable filas={historial} />
        </CardContent>
      </Card>
    </main>
  );
}
