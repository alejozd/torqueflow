import Link from "next/link";
import { requireSession } from "@/lib/auth/guards";
import {
  listCitas,
  listVehiculosParaCita,
  type CitaConDetalle,
} from "@/app/actions/cita-actions";
import { NuevaCitaDialog } from "./nueva-cita-dialog";
import { ExportarCitasButton } from "./exportar-citas-button";
import type { EstadoCita } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ESTADOS_VALIDOS: EstadoCita[] = [
  "PROGRAMADA",
  "CONFIRMADA",
  "CANCELADA",
  "COMPLETADA",
];

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
  CONFIRMADA:
    "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[oklch(0.44_0.12_250)]",
  CANCELADA: "",
  COMPLETADA:
    "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
};

const ESTADO_BADGE_VARIANT: Partial<
  Record<EstadoCita, "outline" | "destructive">
> = {
  PROGRAMADA: "outline",
  CANCELADA: "destructive",
};

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

const formatoHora = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Bogota",
});

const formatoFechaLarga = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Bogota",
});

const formatoFechaCorta = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeZone: "America/Bogota",
});

const formatoDiaMes = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  timeZone: "America/Bogota",
});

/**
 * America/Bogota is a fixed UTC-5 offset with no daylight saving time (same
 * assumption citaInputSchema documents), so the day boundary can be derived
 * without a timezone library: format "today" as a Bogota calendar date, then
 * reconstruct that date's midnight as an explicit UTC-5 instant.
 */
const OFFSET_TALLER = "-05:00";
const formatoDiaBogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
});

function inicioDiaBogota(fecha: Date): Date {
  return new Date(`${formatoDiaBogota.format(fecha)}T00:00:00${OFFSET_TALLER}`);
}

function rangoSemanaBogota(hoy: Date): { inicio: Date; fin: Date } {
  const inicioHoy = inicioDiaBogota(hoy);
  const diaSemana = inicioHoy.getUTCDay(); // 0=domingo..6=sábado
  const diasDesdeElLunes = diaSemana === 0 ? 6 : diaSemana - 1;
  const inicio = new Date(
    inicioHoy.getTime() - diasDesdeElLunes * 24 * 60 * 60 * 1000,
  );
  const fin = new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { inicio, fin };
}

function capitalizar(texto: string): string {
  return texto.length > 0
    ? texto.charAt(0).toUpperCase() + texto.slice(1)
    : texto;
}

interface GrupoDia {
  clave: string;
  etiqueta: string;
  citas: CitaConDetalle[];
}

// `citas`/`filtradas` already arrive sorted by fechaHora asc (listCitas'
// orderBy), so a Map preserves that order across groups without a re-sort.
function agruparPorDia(citas: CitaConDetalle[]): GrupoDia[] {
  const grupos = new Map<string, CitaConDetalle[]>();
  for (const cita of citas) {
    const clave = formatoDiaBogota.format(cita.fechaHora);
    const lista = grupos.get(clave);
    if (lista) {
      lista.push(cita);
    } else {
      grupos.set(clave, [cita]);
    }
  }
  return Array.from(grupos.entries()).map(([clave, citasDelDia]) => ({
    clave,
    etiqueta: capitalizar(formatoFechaLarga.format(citasDelDia[0].fechaHora)),
    citas: citasDelDia,
  }));
}

function construirHref(base: {
  estado?: EstadoCita;
  q?: string;
  vista?: "agenda" | "tabla";
}): string {
  const params = new URLSearchParams();
  if (base.estado) params.set("estado", base.estado);
  if (base.q) params.set("q", base.q);
  if (base.vista && base.vista !== "agenda") params.set("vista", base.vista);
  const query = params.toString();
  return query ? `/citas?${query}` : "/citas";
}

function escaparCsv(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

function construirCsv(citas: CitaConDetalle[]): string {
  const encabezado = [
    "Fecha",
    "Hora",
    "Placa",
    "Vehículo",
    "Cliente",
    "Teléfono",
    "Motivo",
    "Estado",
    "Notas",
  ];
  const filas = citas.map((cita) => [
    formatoFechaCorta.format(cita.fechaHora),
    formatoHora.format(cita.fechaHora),
    cita.vehiculo.placa,
    `${cita.vehiculo.marca} ${cita.vehiculo.modelo}${cita.vehiculo.anio ? ` ${cita.vehiculo.anio}` : ""}`,
    cita.cliente.nombre,
    cita.cliente.telefono ?? "",
    cita.motivo,
    ESTADO_LABELS[cita.estado],
    cita.notas ?? "",
  ]);
  return [encabezado, ...filas]
    .map((fila) => fila.map(escaparCsv).join(","))
    .join("\n");
}

const COLUMNS: DataTableColumn<CitaConDetalle>[] = [
  {
    header: "Fecha y hora",
    cell: (cita) => (
      <div className="flex flex-col">
        <span className="font-mono text-sm font-medium">
          {formatoHora.format(cita.fechaHora)}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatoFechaCorta.format(cita.fechaHora)}
        </span>
      </div>
    ),
  },
  {
    header: "Vehículo",
    cell: (cita) => (
      <div className="flex flex-col">
        <span className="font-mono text-sm font-medium">
          {cita.vehiculo.placa}
        </span>
        <span className="text-xs text-muted-foreground">
          {cita.vehiculo.marca} {cita.vehiculo.modelo}
        </span>
      </div>
    ),
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
      <Badge
        variant={ESTADO_BADGE_VARIANT[cita.estado]}
        className={ESTADO_BADGE_CLASSNAME[cita.estado]}
      >
        {ESTADO_LABELS[cita.estado]}
      </Badge>
    ),
  },
  {
    header: "Notas",
    cell: (cita) =>
      cita.notas ? (
        <span className="text-sm text-muted-foreground">{cita.notas}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export default async function CitasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string; vista?: string }>;
}) {
  const { estado, q, vista } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoCita)
    ? (estado as EstadoCita)
    : undefined;
  const vistaActual: "agenda" | "tabla" =
    vista === "tabla" ? "tabla" : "agenda";
  const busqueda = q?.trim().toLowerCase() ?? "";

  // requireSession() here is redundant with the one inside listCitas/listVehiculosParaCita
  // (same cheap auth() + tenant lookup, no extra query) -- needed to read
  // sedeActivaNombre for the page subtitle, which those actions don't return.
  const session = await requireSession();

  // Both reads go through the actions module, so the guard and the sede filter
  // are applied in exactly one place instead of being restated here. Fetched
  // once, unfiltered: the KPI cards summarize every cita of the sede
  // regardless of which estado/búsqueda the list below is currently filtered to.
  const [citas, vehiculos] = await Promise.all([
    listCitas(),
    listVehiculosParaCita(),
  ]);
  const filtradas = citas
    .filter((cita) => !estadoFiltro || cita.estado === estadoFiltro)
    .filter(
      (cita) =>
        !busqueda ||
        cita.cliente.nombre.toLowerCase().includes(busqueda) ||
        cita.vehiculo.placa.toLowerCase().includes(busqueda) ||
        cita.vehiculo.marca.toLowerCase().includes(busqueda) ||
        cita.vehiculo.modelo.toLowerCase().includes(busqueda) ||
        cita.motivo.toLowerCase().includes(busqueda),
    );

  const ahora = new Date();
  const inicioHoy = inicioDiaBogota(ahora);
  const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000);
  const { inicio: inicioSemana, fin: finSemana } = rangoSemanaBogota(ahora);

  const citasHoy = citas.filter(
    (cita) => cita.fechaHora >= inicioHoy && cita.fechaHora < finHoy,
  ).length;
  const citasSemana = citas.filter(
    (cita) => cita.fechaHora >= inicioSemana && cita.fechaHora < finSemana,
  );
  const confirmadasSemana = citasSemana.filter(
    (cita) => cita.estado === "CONFIRMADA",
  ).length;
  const programadasSemana = citasSemana.filter(
    (cita) => cita.estado === "PROGRAMADA",
  ).length;
  const canceladasSemana = citasSemana.filter(
    (cita) => cita.estado === "CANCELADA",
  ).length;
  const porcentajeCanceladas =
    citasSemana.length > 0
      ? Math.round((canceladasSemana / citasSemana.length) * 100)
      : 0;

  const finSemanaMostrado = new Date(finSemana.getTime() - 24 * 60 * 60 * 1000);
  const rangoSemanaTexto = `${formatoDiaMes.format(inicioSemana)} al ${formatoDiaMes.format(finSemanaMostrado)}`;

  const grupos = agruparPorDia(filtradas);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Citas</h1>
          <p className="text-sm text-muted-foreground">
            Agenda de {session.user.sedeActivaNombre} · semana del{" "}
            {rangoSemanaTexto}
          </p>
        </div>
        <NuevaCitaDialog vehiculos={vehiculos} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Hoy
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold">{citasHoy}</span>
            <p className="text-xs text-muted-foreground">citas agendadas hoy</p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Confirmadas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold">
              {confirmadasSemana}
            </span>
            <p className="text-xs text-muted-foreground">
              esta semana · {programadasSemana} sin confirmar
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Canceladas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold text-destructive">
              {canceladasSemana}
            </span>
            <p className="text-xs text-muted-foreground">
              esta semana
              {citasSemana.length > 0
                ? ` · ${porcentajeCanceladas}% del total`
                : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form role="search" className="flex items-center gap-2">
              {estadoFiltro ? (
                <input type="hidden" name="estado" value={estadoFiltro} />
              ) : null}
              {vistaActual !== "agenda" ? (
                <input type="hidden" name="vista" value={vistaActual} />
              ) : null}
              <Input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Buscar por cliente, placa o motivo…"
                className="w-56"
              />
              <Button type="submit" variant="outline" size="sm">
                Buscar
              </Button>
            </form>

            <div className="flex items-center gap-2">
              <div className="flex gap-1 rounded-full border border-input p-0.5">
                <Link
                  href={construirHref({
                    estado: estadoFiltro,
                    q,
                    vista: "agenda",
                  })}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm transition-colors",
                    vistaActual === "agenda"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  Agenda
                </Link>
                <Link
                  href={construirHref({
                    estado: estadoFiltro,
                    q,
                    vista: "tabla",
                  })}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm transition-colors",
                    vistaActual === "tabla"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  Tabla
                </Link>
              </div>
              <ExportarCitasButton
                csv={construirCsv(filtradas)}
                filename={`citas-${estadoFiltro ?? "todas"}.csv`}
              />
            </div>
          </div>

          <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
            <Link
              href={construirHref({ q, vista: vistaActual })}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                estadoFiltro === undefined
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
              )}
            >
              Todas
            </Link>
            {ESTADOS_VALIDOS.map((value) => (
              <Link
                key={value}
                href={construirHref({ estado: value, q, vista: vistaActual })}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  estadoFiltro === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {ESTADO_LABELS[value]}
              </Link>
            ))}
          </nav>

          {vistaActual === "tabla" ? (
            <DataTable
              columns={COLUMNS}
              rows={filtradas}
              getRowKey={(cita) => cita.id}
              rowHref={(cita) => `/citas/${cita.id}`}
              emptyMessage="No hay citas agendadas en esta sede."
            />
          ) : (
            <div className="flex flex-col gap-6">
              {grupos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay citas agendadas en esta sede.
                </p>
              ) : (
                grupos.map((grupo) => (
                  <div key={grupo.clave} className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-muted-foreground whitespace-nowrap">
                        {grupo.etiqueta}
                      </h3>
                      <div className="flex-1 border-t border-border" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {grupo.citas.length}{" "}
                        {grupo.citas.length === 1 ? "cita" : "citas"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 max-w-6xl">
                      {grupo.citas.map((cita) => (
                        <Link
                          key={cita.id}
                          href={`/citas/${cita.id}`}
                          className="block"
                        >
                          <Card className="h-full transition-colors hover:bg-accent/50">
                            <CardContent className="flex flex-col gap-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-lg font-semibold">
                                  {formatoHora.format(cita.fechaHora)}
                                </span>
                                <Badge
                                  variant={ESTADO_BADGE_VARIANT[cita.estado]}
                                  className={
                                    ESTADO_BADGE_CLASSNAME[cita.estado]
                                  }
                                >
                                  {ESTADO_LABELS[cita.estado]}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                                <span className="font-mono">
                                  {cita.vehiculo.placa}
                                </span>
                                <span className="text-muted-foreground">
                                  · {cita.vehiculo.marca} {cita.vehiculo.modelo}
                                  {cita.vehiculo.anio
                                    ? ` · ${cita.vehiculo.anio}`
                                    : ""}
                                </span>
                              </div>
                              <p className="text-sm">{cita.motivo}</p>
                              <div className="flex items-center justify-between border-t border-border pt-2 mt-1 text-xs text-muted-foreground">
                                <span>{cita.cliente.nombre}</span>
                                {cita.cliente.telefono && (
                                  <span className="font-mono">
                                    {cita.cliente.telefono}
                                  </span>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
