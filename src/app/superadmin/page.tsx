import { listTenantsConPlan, listPlanes } from "@/app/actions/super-admin-actions";
import { TenantRowActions } from "./tenant-row-actions";

export default async function SuperAdminPage() {
  const [tenants, planes] = await Promise.all([listTenantsConPlan(), listPlanes()]);

  return (
    <main>
      <h1>Talleres</h1>
      <table>
        <thead>
          <tr>
            <th>Taller</th>
            <th>Estado</th>
            <th>Plan</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr key={tenant.id}>
              <td>{tenant.slug}</td>
              <td>{tenant.estado}</td>
              <td>{tenant.plan.nombre}</td>
              <td>
                <TenantRowActions
                  tenantId={tenant.id}
                  estadoActual={tenant.estado}
                  planIdActual={tenant.planId}
                  planes={planes}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
