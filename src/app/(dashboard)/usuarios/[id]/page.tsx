import { notFound } from "next/navigation";
import { listUsuariosConSedes } from "@/app/actions/usuario-actions";
import { EditarUsuarioForm } from "./editar-usuario-form";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuarios = await listUsuariosConSedes();
  const usuario = usuarios.find((u) => u.id === id);
  if (!usuario) {
    notFound();
  }

  return (
    <main>
      <h1>Editar usuario</h1>
      <EditarUsuarioForm usuario={usuario} />
    </main>
  );
}
