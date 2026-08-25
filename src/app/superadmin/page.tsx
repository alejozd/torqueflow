import { listTenantsConPlan, listPlanes, type TenantConPlan } from "@/app/actions/super-admin-actions";
import { TenantRowActions } from "./tenant-row-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";

export default async function SuperAdminPage() {
  const [tenants, planes] = await Promise.all([listTenantsConPlan(), listPlanes()]);

  const columns: DataTableColumn<TenantConPlan>[] = [
    { header: "Taller", cell: (tenant) => tenant.slug },
    { header: "Estado", cell: (tenant) => tenant.estado },
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
    <main>
      <h1>Talleres</h1>
      <DataTable
        columns={columns}
        rows={tenants}
        getRowKey={(tenant) => tenant.id}
        emptyMessage="No hay talleres registrados."
      />
    </main>
  );
}
