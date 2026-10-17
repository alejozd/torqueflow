import { notFound } from "next/navigation";
import { listUsuariosConSedes } from "@/app/actions/usuario-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { requirePermiso } from "@/lib/auth/guards";
import { FichaUsuario } from "./ficha-usuario";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermiso("usuarios.gestionar");
  const { id } = await params;
  const [usuarios, sedes] = await Promise.all([listUsuariosConSedes(), listSedes()]);
  const usuario = usuarios.find((u) => u.id === id);
  if (!usuario) {
    notFound();
  }

  return (
    <main>
      <FichaUsuario usuario={usuario} sedes={sedes} />
    </main>
  );
}
