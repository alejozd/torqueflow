import Link from "next/link";
import { listAuditLog, type AuditLogConActor } from "@/app/actions/auditoria-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TipoEventoAuditoria } from "@/generated/prisma-tenant";
import { TIPOS_EVENTO_AUDITORIA, TIPO_EVENTO_AUDITORIA_LABELS } from "@/lib/auditoria/catalogo";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

// Solo ORDEN_ANULAR tiene una página de detalle real hoy (/ordenes/[id]) --
// usuarios y bodegas eliminados no tienen una a la que enlazar.
function hrefEntidad(evento: AuditLogConActor): string | null {
  if (evento.entidadTipo === "OrdenTrabajo") return `/ordenes/${evento.entidadId}`;
  return null;
}

const COLUMNS: DataTableColumn<AuditLogConActor>[] = [
  { header: "Fecha", cell: (evento) => formatoFecha.format(evento.createdAt) },
  {
    header: "Evento",
    cell: (evento) => <Badge variant="outline">{TIPO_EVENTO_AUDITORIA_LABELS[evento.tipo]}</Badge>,
    searchValue: (evento) => TIPO_EVENTO_AUDITORIA_LABELS[evento.tipo],
  },
  {
    header: "Actor",
    cell: (evento) => evento.actorNombre ?? <span className="text-muted-foreground">(usuario eliminado)</span>,
    searchValue: (evento) => evento.actorNombre ?? "",
  },
  {
    header: "Entidad",
    cell: (evento) => {
      const href = hrefEntidad(evento);
      return href ? (
        <Link href={href} className="text-primary underline-offset-4 hover:underline">
          {evento.entidadTipo} · {evento.entidadId}
        </Link>
      ) : (
        <span>
          {evento.entidadTipo} · {evento.entidadId}
        </span>
      );
    },
  },
  {
    header: "Detalle",
    cell: (evento) =>
      evento.detalle ? (
        <code className="text-xs text-muted-foreground">{JSON.stringify(evento.detalle)}</code>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const tipoFiltro = TIPOS_EVENTO_AUDITORIA.includes(tipo as TipoEventoAuditoria)
    ? (tipo as TipoEventoAuditoria)
    : undefined;

  const eventos = await listAuditLog({ tipo: tipoFiltro });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          Últimos {eventos.length} evento(s) sensible(s) registrados en este taller.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav aria-label="Filtrar por tipo de evento" className="flex flex-wrap gap-2">
            <Link
              href="/auditoria"
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                tipoFiltro === undefined
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
              )}
            >
              Todos
            </Link>
            {TIPOS_EVENTO_AUDITORIA.map((tipoOpcion) => (
              <Link
                key={tipoOpcion}
                href={`/auditoria?tipo=${tipoOpcion}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  tipoFiltro === tipoOpcion
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {TIPO_EVENTO_AUDITORIA_LABELS[tipoOpcion]}
              </Link>
            ))}
          </nav>

          <DataTable
            columns={COLUMNS}
            rows={eventos}
            getRowKey={(evento) => evento.id}
            emptyMessage="No hay eventos de auditoría registrados."
            searchable
            searchPlaceholder="Buscar por evento o actor..."
            pageSize={20}
          />
        </CardContent>
      </Card>
    </main>
  );
}
