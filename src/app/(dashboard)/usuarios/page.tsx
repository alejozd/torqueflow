import Link from "next/link";
import { listUsuariosConSedes } from "@/app/actions/usuario-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { AsignarSedesForm } from "./asignar-sedes-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

const ROLE_LABELS: Record<"ADMIN" | "TECNICO" | "RECEPCION", string> = {
  ADMIN: "Administrador",
  TECNICO: "Técnico",
  RECEPCION: "Recepción",
};

type Usuario = Awaited<ReturnType<typeof listUsuariosConSedes>>[number];
type SedeOption = { id: string; nombre: string };

function buildColumns(sedes: SedeOption[]): DataTableColumn<Usuario>[] {
  return [
    {
      header: "Nombre",
      cell: (usuario) => <h2>{usuario.nombre}</h2>,
    },
    {
      header: "Correo / Rol",
      cell: (usuario) => (
        <>
          {usuario.email} — {ROLE_LABELS[usuario.role]}
        </>
      ),
    },
    {
      header: "Acciones",
      cell: (usuario) => (
        <>
          <Link href={`/usuarios/${usuario.id}`}>Editar</Link>
          <AsignarSedesForm usuario={usuario} sedes={sedes} />
        </>
      ),
    },
  ];
}

export default async function UsuariosPage() {
  // Sequential, not Promise.all: both calls go through requireRole, which
  // redirect()s by throwing. Racing two throwing guards is the pattern Fase 5
  // Task 9 deliberately avoided on /reportes.
  const usuarios = await listUsuariosConSedes();
  const sedes = await listSedes();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Usuarios</h1>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Un administrador puede trabajar en cualquier sede aunque no esté asignado a ella.
          </p>
          <Link href="/usuarios/nuevo" className={buttonVariants({ className: "self-start" })}>
            Crear usuario
          </Link>
          <DataTable
            columns={buildColumns(sedes.map((sede) => ({ id: sede.id, nombre: sede.nombre })))}
            rows={usuarios}
            getRowKey={(usuario) => usuario.id}
            emptyMessage="No hay usuarios registrados."
          />
        </CardContent>
      </Card>
    </main>
  );
}
