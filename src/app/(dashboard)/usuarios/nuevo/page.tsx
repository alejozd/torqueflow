import { NuevoUsuarioForm } from "./nuevo-usuario-form";
import { listSedes } from "@/app/actions/sede-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermiso } from "@/lib/auth/guards";

export default async function NuevoUsuarioPage() {
  await requirePermiso("usuarios.gestionar");
  const sedes = await listSedes();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Crear usuario</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoUsuarioForm sedes={sedes} />
        </CardContent>
      </Card>
    </main>
  );
}
