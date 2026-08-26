import Link from "next/link";
import { listCitas, listVehiculosParaCita, type CitaConDetalle } from "@/app/actions/cita-actions";
import { NuevaCitaForm } from "./nueva-cita-form";
import type { EstadoCita } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ESTADOS_VALIDOS: EstadoCita[] = ["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA"];

const ESTADO_LABELS: Record<EstadoCita, string> = {
  PROGRAMADA: "Programada",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
  COMPLETADA: "Completada",
};

// Scheduled (neutral) -> confirmed (blue) -> completed (green) / cancelled
// (red). Badge's own variants cover outline/destructive; confirmed/completed
// reuse the same bg-X/10 + text-X className mechanism the destructive variant
// uses internally, matching the Ordenes module's convention.
const ESTADO_BADGE_CLASSNAME: Record<EstadoCita, string> = {
  PROGRAMADA: "",
  CONFIRMADA: "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[oklch(0.44_0.12_250)]",
  CANCELADA: "",
  COMPLETADA: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
};

const ESTADO_BADGE_VARIANT: Partial<Record<EstadoCita, "outline" | "destructive">> = {
  PROGRAMADA: "outline",
  CANCELADA: "destructive",
};

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

/**
 * America/Bogota is a fixed UTC-5 offset with no daylight saving time (same
 * assumption citaInputSchema documents), so the day boundary can be derived
 * without a timezone library: format "today" as a Bogota calendar date, then
 * reconstruct that date's midnight as an explicit UTC-5 instant.
 */
const OFFSET_TALLER = "-05:00";
const formatoDiaBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });

function inicioDiaBogota(fecha: Date): Date {
  return new Date(`${formatoDiaBogota.format(fecha)}T00:00:00${OFFSET_TALLER}`);
}

function rangoSemanaBogota(hoy: Date): { inicio: Date; fin: Date } {
  const inicioHoy = inicioDiaBogota(hoy);
  const diaSemana = inicioHoy.getUTCDay(); // 0=domingo..6=sábado
  const diasDesdeElLunes = diaSemana === 0 ? 6 : diaSemana - 1;
  const inicio = new Date(inicioHoy.getTime() - diasDesdeElLunes * 24 * 60 * 60 * 1000);
  const fin = new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { inicio, fin };
}

const COLUMNS: DataTableColumn<CitaConDetalle>[] = [
  {
    header: "Fecha y hora",
    cell: (cita) => (
      <Link href={`/citas/${cita.id}`} className="font-mono text-sm hover:underline">
        {formatoFecha.format(cita.fechaHora)}
      </Link>
    ),
  },
  {
    header: "Vehículo",
    cell: (cita) => <span className="font-mono text-sm">{cita.vehiculo.placa}</span>,
  },
  {
    header: "Cliente",
    cell: (cita) => cita.cliente.nombre,
  },
  {
    header: "Motivo",
    cell: (cita) => cita.motivo,
  },
  {
    header: "Estado",
    cell: (cita) => (
      <Badge variant={ESTADO_BADGE_VARIANT[cita.estado]} className={ESTADO_BADGE_CLASSNAME[cita.estado]}>
        {ESTADO_LABELS[cita.estado]}
      </Badge>
    ),
  },
  {
    header: "Notas",
    cell: (cita) =>
      cita.notas ? <span className="text-sm text-muted-foreground">{cita.notas}</span> : <span className="text-muted-foreground">—</span>,
  },
];

export default async function CitasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoCita) ? (estado as EstadoCita) : undefined;

  // Both reads go through the actions module, so the guard and the sede filter
  // are applied in exactly one place instead of being restated here. Fetched
  // once, unfiltered: the KPI cards summarize every cita of the sede
  // regardless of which estado the list below is currently filtered to.
  const [citas, vehiculos] = await Promise.all([listCitas(), listVehiculosParaCita()]);
  const filtradas = estadoFiltro ? citas.filter((cita) => cita.estado === estadoFiltro) : citas;

  const ahora = new Date();
  const inicioHoy = inicioDiaBogota(ahora);
  const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000);
  const { inicio: inicioSemana, fin: finSemana } = rangoSemanaBogota(ahora);

  const citasHoy = citas.filter((cita) => cita.fechaHora >= inicioHoy && cita.fechaHora < finHoy).length;
  const confirmadasSemana = citas.filter(
    (cita) => cita.estado === "CONFIRMADA" && cita.fechaHora >= inicioSemana && cita.fechaHora < finSemana,
  ).length;
  const canceladasSemana = citas.filter(
    (cita) => cita.estado === "CANCELADA" && cita.fechaHora >= inicioSemana && cita.fechaHora < finSemana,
  ).length;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Citas</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{citasHoy}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Confirmadas esta semana</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{confirmadasSemana}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Canceladas esta semana</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{canceladasSemana}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva cita</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevaCitaForm vehiculos={vehiculos} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
            <Link
              href="/citas"
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                estadoFiltro === undefined
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
              )}
            >
              Todas
            </Link>
            {ESTADOS_VALIDOS.map((value) => (
              <Link
                key={value}
                href={`/citas?estado=${value}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  estadoFiltro === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {ESTADO_LABELS[value]}
              </Link>
            ))}
          </nav>

          <DataTable
            columns={COLUMNS}
            rows={filtradas}
            getRowKey={(cita) => cita.id}
            emptyMessage="No hay citas agendadas en esta sede."
          />
        </CardContent>
      </Card>
    </main>
  );
}
