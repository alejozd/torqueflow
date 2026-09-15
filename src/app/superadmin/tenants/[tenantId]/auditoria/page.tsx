import Link from "next/link";
import { notFound } from "next/navigation";
import { listAuditLogTenant } from "@/app/actions/super-admin-actions";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuditLogConActor } from "@/app/actions/auditoria-actions";
import { TIPO_EVENTO_AUDITORIA_LABELS } from "@/lib/auditoria/catalogo";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

const COLUMNS: DataTableColumn<AuditLogConActor>[] = [
  { header: "Fecha", cell: (evento) => formatoFecha.format(evento.createdAt) },
  {
    header: "Evento",
    cell: (evento) => <Badge variant="outline">{TIPO_EVENTO_AUDITORIA_LABELS[evento.tipo]}</Badge>,
  },
  {
    header: "Actor",
    cell: (evento) => evento.actorNombre ?? <span className="text-muted-foreground">(usuario eliminado)</span>,
  },
  { header: "Entidad", cell: (evento) => `${evento.entidadTipo} · ${evento.entidadId}` },
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

export default async function SuperAdminTenantAuditoriaPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  await requireSuperAdmin();
  const { tenantId } = await params;
  const resultado = await listAuditLogTenant(tenantId);
  if (!resultado) notFound();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Auditoría de {resultado.tenant.nombre ?? resultado.tenant.slug}</h1>
          <p className="text-sm text-muted-foreground">
            {resultado.eventos.length} evento(s) registrados en este taller.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/superadmin" />}>
          Volver a talleres
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={resultado.eventos}
            getRowKey={(evento) => evento.id}
            emptyMessage="No hay eventos de auditoría registrados en este taller."
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}
