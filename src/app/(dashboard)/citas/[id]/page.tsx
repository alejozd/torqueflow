import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { getCita, listCitas, listVehiculosParaCita } from "@/app/actions/cita-actions";
import type { EstadoCita } from "@/generated/prisma-tenant";
import { CambiarEstadoCitaForm } from "./cambiar-estado-cita-form";
import { EditarCitaForm } from "./editar-cita-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Mirrors citas/page.tsx's own copy -- this codebase keeps estado
// label/badge maps local to each page rather than sharing a module (see
// ordenes/page.tsx vs ordenes/[id]/page.tsx for the same convention).
const ESTADO_LABELS: Record<EstadoCita, string> = {
  PROGRAMADA: "Programada",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
  COMPLETADA: "Completada",
};

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

const formatoFechaCorta = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});

const formatoHora = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Bogota",
});

const formatoDiaLargo = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  timeZone: "America/Bogota",
});

const formatoDiaBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });

export default async function CitaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();

  // getCita is a sede-scoped findFirst, so a cita from another sede arrives here
  // as null and this 404s. That is the whole IDOR boundary for this route:
  // pasting another sede's cita URL must not resolve.
  const [cita, vehiculos, citas] = await Promise.all([getCita(id), listVehiculosParaCita(), listCitas()]);
  if (!cita) {
    notFound();
  }

  const otrasDelDia = citas
    .filter((c) => c.id !== cita.id && formatoDiaBogota.format(c.fechaHora) === formatoDiaBogota.format(cita.fechaHora))
    .sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime());

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/citas"
          className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Citas
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">{`Cita ${cita.vehiculo.placa}`}</h1>
            <Badge variant={ESTADO_BADGE_VARIANT[cita.estado]} className={ESTADO_BADGE_CLASSNAME[cita.estado]}>
              {ESTADO_LABELS[cita.estado]}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {formatoFechaCorta.format(cita.fechaHora)} · {formatoHora.format(cita.fechaHora)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {cita.cliente.nombre} · agendada por {cita.creadoPor.nombre} · {session.user.sedeActivaNombre}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 basis-[560px] flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Editar cita</CardTitle>
              <span className="text-xs text-muted-foreground">Los cambios reagendan y notifican al cliente</span>
            </CardHeader>
            <CardContent>
              <EditarCitaForm cita={cita} vehiculos={vehiculos} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{`Agenda del ${formatoDiaLargo.format(cita.fechaHora)}`}</CardTitle>
            </CardHeader>
            <CardContent>
              {otrasDelDia.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay más citas agendadas ese día.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {otrasDelDia.map((otra) => (
                    <Link
                      key={otra.id}
                      href={`/citas/${otra.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
                    >
                      <span className="w-12 shrink-0 font-mono text-xs font-medium text-muted-foreground">
                        {formatoHora.format(otra.fechaHora)}
                      </span>
                      <span className="w-20 shrink-0 font-mono text-xs">{otra.vehiculo.placa}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{otra.motivo}</span>
                      <Badge
                        variant={ESTADO_BADGE_VARIANT[otra.estado]}
                        className={ESTADO_BADGE_CLASSNAME[otra.estado]}
                      >
                        {ESTADO_LABELS[otra.estado]}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="sticky top-4 flex min-w-0 flex-1 basis-[300px] flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{`Estado actual: ${ESTADO_LABELS[cita.estado]}`}</CardTitle>
            </CardHeader>
            <CardContent>
              <CambiarEstadoCitaForm citaId={cita.id} estadoActual={cita.estado} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cliente y vehículo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{cita.cliente.nombre}</span>
                <Link
                  href={`/clientes/${cita.cliente.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Ver ficha
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/50 p-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Teléfono</p>
                  <p className="font-mono text-xs">{cita.cliente.telefono ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Vehículo</p>
                  <p className="text-xs">
                    {cita.vehiculo.marca} {cita.vehiculo.modelo}
                    {cita.vehiculo.anio ? ` · ${cita.vehiculo.anio}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Placa</p>
                  <p className="font-mono text-xs">{cita.vehiculo.placa}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Kilometraje</p>
                  <p className="font-mono text-xs">
                    {cita.vehiculo.kilometraje !== null ? `${cita.vehiculo.kilometraje.toLocaleString("es-CO")} km` : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
