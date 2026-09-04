import Link from "next/link";
import { Headset, ShieldCheck, Wrench } from "lucide-react";
import { listUsuariosConMetricas, type UsuarioConMetricas } from "@/app/actions/usuario-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { AsignarSedesDialog } from "./asignar-sedes-dialog";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { KPI_TONE, KpiCard, type KpiTone } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";

type Role = "ADMIN" | "TECNICO" | "RECEPCION";

const ROLES_VALIDOS: Role[] = ["ADMIN", "TECNICO", "RECEPCION"];

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  TECNICO: "Técnico",
  RECEPCION: "Recepción",
};

const ROLE_LABELS_PLURAL: Record<Role, string> = {
  ADMIN: "Administradores",
  TECNICO: "Técnicos",
  RECEPCION: "Recepción",
};

// ADMIN gets the primary brand color (it is the structurally distinct role --
// bypasses UsuarioSede entirely); TECNICO/RECEPCION reuse the blue/green pair
// already established by /ordenes for "in progress" vs. "done" states.
const ROLE_BADGE_CLASSNAME: Record<Role, string> = {
  ADMIN: "border-transparent bg-primary/10 text-primary",
  TECNICO: "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[oklch(0.44_0.12_250)]",
  RECEPCION: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
};

// Same role/color pairing as ROLE_BADGE_CLASSNAME, mapped onto the KPI_TONE
// palette: ADMIN's primary/amber -> warning, TECNICO's blue -> info,
// RECEPCION's green -> success.
const ROLE_TONE: Record<Role, KpiTone> = {
  ADMIN: "warning",
  TECNICO: "info",
  RECEPCION: "success",
};

const ROLE_ICON: Record<Role, typeof ShieldCheck> = {
  ADMIN: ShieldCheck,
  TECNICO: Wrench,
  RECEPCION: Headset,
};

// Same literal colors as ROLE_BADGE_CLASSNAME, for the filter pills' dots.
const ROLE_DOT_COLOR: Record<Role, string> = {
  ADMIN: "var(--primary)",
  TECNICO: "oklch(0.44 0.12 250)",
  RECEPCION: "oklch(0.4 0.1 150)",
};

type SedeOption = { id: string; nombre: string };

function buildColumns(sedesPorId: Map<string, string>, sedeOptions: SedeOption[]): DataTableColumn<UsuarioConMetricas>[] {
  return [
    {
      header: "Usuario",
      cell: (usuario) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{usuario.nombre}</span>
          <span className="text-xs text-muted-foreground">{usuario.email}</span>
        </div>
      ),
      searchValue: (usuario) => `${usuario.nombre} ${usuario.email}`,
    },
    {
      header: "Rol",
      cell: (usuario) => (
        <Badge className={ROLE_BADGE_CLASSNAME[usuario.role]}>{ROLE_LABELS[usuario.role]}</Badge>
      ),
    },
    {
      header: "Sedes asignadas",
      cell: (usuario) => {
        // ADMIN bypasses UsuarioSede entirely (src/lib/auth/sede-access.ts) --
        // an empty sedeIds list here means "puede operar cualquier sede", not
        // "sin sedes", so it gets its own honest label instead of a blank cell.
        if (usuario.role === "ADMIN") {
          return <span className="text-sm text-muted-foreground">Todas</span>;
        }
        if (usuario.sedeIds.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {usuario.sedeIds.map((sedeId) => (
              <Badge key={sedeId} variant="outline">
                {sedesPorId.get(sedeId) ?? "Sede desconocida"}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      header: "Órdenes activas",
      className: "text-right",
      cell: (usuario) => <span className="font-mono">{usuario.ordenesActivas}</span>,
    },
    {
      header: "Acciones",
      cell: (usuario) => (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/usuarios/${usuario.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Editar
          </Link>
          <AsignarSedesDialog usuario={usuario} sedes={sedeOptions} />
        </div>
      ),
    },
  ];
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ rol?: string }>;
}) {
  const { rol } = await searchParams;
  const rolFiltro = ROLES_VALIDOS.includes(rol as Role) ? (rol as Role) : undefined;

  // Sequential, not Promise.all: both calls go through requireRole, which
  // redirect()s by throwing. Racing two throwing guards is the pattern Fase 5
  // Task 9 deliberately avoided on /reportes.
  const usuarios = await listUsuariosConMetricas();
  const sedes = await listSedes();

  const sedeOptions: SedeOption[] = sedes.map((sede) => ({ id: sede.id, nombre: sede.nombre }));
  const sedesPorId = new Map(sedeOptions.map((sede) => [sede.id, sede.nombre]));

  const filtrados = rolFiltro ? usuarios.filter((usuario) => usuario.role === rolFiltro) : usuarios;

  const totalesPorRol = ROLES_VALIDOS.reduce(
    (totales, role) => ({ ...totales, [role]: usuarios.filter((usuario) => usuario.role === role).length }),
    {} as Record<Role, number>,
  );

  // ADMIN bypasses UsuarioSede entirely (see the "Sedes asignadas" column
  // below), so an empty sedeIds list only signals a gap for non-ADMIN roles.
  const sinSedeAsignada = usuarios.filter(
    (usuario) => usuario.role !== "ADMIN" && usuario.sedeIds.length === 0,
  ).length;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold">Usuarios</h1>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {sinSedeAsignada} sin sede asignada
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{usuarios.length} usuarios registrados</p>
        </div>
        <Link href="/usuarios/nuevo" className={buttonVariants({})}>
          Crear usuario
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ROLES_VALIDOS.map((role) => {
          const Icon = ROLE_ICON[role];
          const tone = KPI_TONE[ROLE_TONE[role]];
          return (
            <KpiCard
              key={role}
              title={ROLE_LABELS_PLURAL[role]}
              value={totalesPorRol[role]}
              icon={<Icon className={cn("size-5", tone.icon)} />}
              iconBgColor={tone.iconBg}
              className={tone.cardBg}
            />
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Un administrador puede trabajar en cualquier sede aunque no esté asignado a ella.
          </p>

          <nav aria-label="Filtrar por rol" className="flex flex-wrap gap-2">
            <Link
              href="/usuarios"
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                rolFiltro === undefined
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
              )}
            >
              Todos
            </Link>
            {ROLES_VALIDOS.map((role) => (
              <Link
                key={role}
                href={`/usuarios?rol=${role}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                  rolFiltro === role
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: rolFiltro === role ? "currentColor" : ROLE_DOT_COLOR[role] }}
                />
                {ROLE_LABELS[role]}
              </Link>
            ))}
          </nav>

          <DataTable
            columns={buildColumns(sedesPorId, sedeOptions)}
            rows={filtrados}
            getRowKey={(usuario) => usuario.id}
            emptyMessage="No hay usuarios registrados."
            searchable
            searchPlaceholder="Buscar por nombre o correo..."
            pageSize={10}
            headerClassName="bg-muted"
          />
        </CardContent>
      </Card>
    </main>
  );
}
