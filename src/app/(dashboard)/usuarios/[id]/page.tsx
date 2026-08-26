import { notFound } from "next/navigation";
import { listUsuariosConSedes } from "@/app/actions/usuario-actions";
import { EditarUsuarioForm } from "./editar-usuario-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuarios = await listUsuariosConSedes();
  const usuario = usuarios.find((u) => u.id === id);
  if (!usuario) {
    notFound();
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Editar usuario</h1>

      <Card>
        <CardHeader>
          <CardTitle>Editar usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <EditarUsuarioForm usuario={usuario} />
        </CardContent>
      </Card>
    </main>
  );
}
