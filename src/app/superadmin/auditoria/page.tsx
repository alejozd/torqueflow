import Link from "next/link";
import { listAuditLogPlataforma } from "@/app/actions/super-admin-actions";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuditLogPlataformaConSuperAdmin } from "@/app/actions/super-admin-actions";

const TIPO_LABELS: Record<string, string> = {
  TENANT_CREAR: "Tenant creado",
  TENANT_CAMBIAR_PLAN: "Plan cambiado",
  TENANT_CAMBIAR_ESTADO: "Estado cambiado",
};

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

const COLUMNS: DataTableColumn<AuditLogPlataformaConSuperAdmin>[] = [
  { header: "Fecha", cell: (evento) => formatoFecha.format(evento.createdAt) },
  {
    header: "Evento",
    cell: (evento) => <Badge variant="outline">{TIPO_LABELS[evento.tipo] ?? evento.tipo}</Badge>,
  },
  {
    header: "Super-admin",
    cell: (evento) => evento.superAdminNombre ?? <span className="text-muted-foreground">—</span>,
  },
  { header: "Tenant", cell: (evento) => evento.tenantSlug ?? <span className="text-muted-foreground">—</span> },
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

export default async function SuperAdminAuditoriaPage() {
  await requireSuperAdmin();
  const eventos = await listAuditLogPlataforma();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Auditoría de plataforma</h1>
          <p className="text-sm text-muted-foreground">
            Últimos {eventos.length} evento(s) de creación de tenants, cambios de plan y cambios de estado.
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
            rows={eventos}
            getRowKey={(evento) => evento.id}
            emptyMessage="No hay eventos de auditoría de plataforma registrados."
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}
