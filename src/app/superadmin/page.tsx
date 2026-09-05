import { listTenantsConPlan, listPlanes, type TenantConPlan } from "@/app/actions/super-admin-actions";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { TenantRowActions } from "./tenant-row-actions";
import { CrearTenantForm } from "./crear-tenant-form";
import { SignOutButton } from "./sign-out-button";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Same green/destructive convention as /ordenes and /usuarios: ACTIVO reuses
// the "done"/positive tone, SUSPENDIDO uses the Badge destructive variant.
const ESTADO_LABELS: Record<"ACTIVO" | "SUSPENDIDO", string> = {
  ACTIVO: "Activo",
  SUSPENDIDO: "Suspendido",
};

const ESTADO_BADGE_CLASSNAME: Record<"ACTIVO" | "SUSPENDIDO", string> = {
  ACTIVO: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  SUSPENDIDO: "",
};

export default async function SuperAdminPage() {
  const superAdmin = await requireSuperAdmin();
  const [tenants, planes] = await Promise.all([listTenantsConPlan(), listPlanes()]);

  const columns: DataTableColumn<TenantConPlan>[] = [
    { header: "Taller", cell: (tenant) => tenant.slug, searchValue: (tenant) => tenant.slug },
    {
      header: "Estado",
      cell: (tenant) => (
        <Badge
          variant={tenant.estado === "SUSPENDIDO" ? "destructive" : undefined}
          className={ESTADO_BADGE_CLASSNAME[tenant.estado]}
        >
          {ESTADO_LABELS[tenant.estado]}
        </Badge>
      ),
    },
    { header: "Plan", cell: (tenant) => tenant.plan.nombre },
    {
      header: "Acciones",
      cell: (tenant) => (
        <TenantRowActions
          tenantId={tenant.id}
          estadoActual={tenant.estado}
          planIdActual={tenant.planId}
          planes={planes}
        />
      ),
    },
  ];

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Talleres</h1>
          <p className="text-sm text-muted-foreground">{tenants.length} talleres registrados</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end leading-tight">
            <span className="text-sm font-medium">{superAdmin.nombre}</span>
            <span className="text-xs text-muted-foreground">{superAdmin.email}</span>
          </div>
          <SignOutButton />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Crear nuevo cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <CrearTenantForm planes={planes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={tenants}
            getRowKey={(tenant) => tenant.id}
            emptyMessage="No hay talleres registrados."
            searchable
            searchPlaceholder="Buscar por taller..."
            pageSize={10}
          />
        </CardContent>
      </Card>
    </main>
  );
}
