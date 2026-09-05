import { Building2, CheckCircle2, Plus, Users, Zap } from "lucide-react";
import {
  listTenantsConPlan,
  listPlanes,
  contarUsuariosGlobal,
  type TenantConPlan,
} from "@/app/actions/super-admin-actions";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { TenantRowActions } from "./tenant-row-actions";
import { CrearTenantForm } from "./crear-tenant-form";
import { SignOutButton } from "./sign-out-button";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { KpiCard } from "@/components/ui/kpi-card";

// Same convention as (dashboard)/layout.tsx's getIniciales.
function getIniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]!.charAt(0) + partes[1]!.charAt(0)).toUpperCase();
}

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

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

/** "1 Avanzado · 2 Básicos", planes con más tenants primero. */
function resumirMixDePlanes(tenants: TenantConPlan[]): string {
  const conteoPorPlan = new Map<string, number>();
  for (const tenant of tenants) {
    conteoPorPlan.set(tenant.plan.nombre, (conteoPorPlan.get(tenant.plan.nombre) ?? 0) + 1);
  }
  return [...conteoPorPlan.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([nombre, cantidad]) => `${cantidad} ${nombre}`)
    .join(" · ");
}

export default async function SuperAdminPage() {
  const superAdmin = await requireSuperAdmin();
  const [tenants, planes, usuariosGlobal] = await Promise.all([
    listTenantsConPlan(),
    listPlanes(),
    contarUsuariosGlobal(),
  ]);

  const haceUnMes = new Date();
  haceUnMes.setDate(haceUnMes.getDate() - 30);
  const tenantsNuevosUltimoMes = tenants.filter((tenant) => tenant.createdAt >= haceUnMes).length;
  const tenantsActivos = tenants.filter((tenant) => tenant.estado === "ACTIVO").length;
  const porcentajeOperatividad = tenants.length > 0 ? Math.round((tenantsActivos / tenants.length) * 100) : 100;
  const planesDistintos = new Set(tenants.map((tenant) => tenant.plan.nombre)).size;

  const columns: DataTableColumn<TenantConPlan>[] = [
    {
      header: "Taller",
      cell: (tenant) => tenant.nombre ?? tenant.slug,
      searchValue: (tenant) => tenant.nombre ?? tenant.slug,
    },
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
    { header: "Fecha de creación", cell: (tenant) => formatoFecha.format(tenant.createdAt) },
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
    <div className="flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-amber-600">TorqueFlow</span>
          <Badge className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">Superadmin</Badge>
        </div>
        <div className="hidden items-center gap-2 text-sm md:flex">
          <span className="text-green-600">● Producción · Activo</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">v1.0 – TorqueFlow</span>
        </div>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className="bg-amber-500 text-white">{getIniciales(superAdmin.nombre)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">{superAdmin.nombre}</span>
            <span className="text-xs text-muted-foreground">{superAdmin.email}</span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">Gestión de Talleres (Tenants)</h1>
            <Badge className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
              {tenants.length} talleres registrados
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Administración centralizada de instancias de talleres y asignación de planes.
          </p>
        </div>
        <a href="#crear-tenant" className={buttonVariants({ className: "bg-amber-600 text-white hover:bg-amber-700" })}>
          <Plus />
          Nuevo Taller
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total talleres"
          value={tenants.length}
          subtitle={
            tenantsNuevosUltimoMes > 0 ? `↑ +${tenantsNuevosUltimoMes} nuevo(s) este mes` : "Sin altas este mes"
          }
          subtitleColor={tenantsNuevosUltimoMes > 0 ? "success" : "default"}
          icon={<Building2 className="size-5" />}
          iconBgColor="bg-amber-50"
        />
        <KpiCard
          title="Talleres activos"
          value={`${tenantsActivos} / ${tenants.length}`}
          valueColor="success"
          subtitle={`${porcentajeOperatividad}% de operatividad`}
          subtitleColor={porcentajeOperatividad === 100 ? "success" : "default"}
          icon={<CheckCircle2 className="size-5" />}
          iconBgColor="bg-green-50"
        />
        <KpiCard
          title="Mix de planes"
          value={resumirMixDePlanes(tenants) || "Sin datos"}
          subtitle={`${planesDistintos} plan(es) distintos en uso`}
          icon={<Zap className="size-5" />}
          iconBgColor="bg-blue-50"
        />
        <KpiCard
          title="Total de usuarios"
          value={usuariosGlobal.total}
          subtitle={
            usuariosGlobal.nuevosUltimoMes > 0
              ? `↑ +${usuariosGlobal.nuevosUltimoMes} nuevos este mes`
              : "Sin altas este mes"
          }
          subtitleColor={usuariosGlobal.nuevosUltimoMes > 0 ? "success" : "default"}
          icon={<Users className="size-5" />}
          iconBgColor="bg-purple-50"
        />
      </div>

      <Card id="crear-tenant">
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
    </div>
  );
}
