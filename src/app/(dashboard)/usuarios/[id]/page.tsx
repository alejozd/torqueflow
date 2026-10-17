import { notFound } from "next/navigation";
import { listUsuariosConSedes } from "@/app/actions/usuario-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { EditarUsuarioForm } from "./editar-usuario-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PermisosUsuario } from "./permisos-usuario";
import { CabeceraUsuario } from "./cabecera-usuario";
import { KeyRound } from "lucide-react";
import { TituloSeccion } from "@/components/titulo-seccion";
import { requirePermiso } from "@/lib/auth/guards";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermiso("usuarios.gestionar");
  const { id } = await params;
  const [usuarios, sedes] = await Promise.all([listUsuariosConSedes(), listSedes()]);
  const usuario = usuarios.find((u) => u.id === id);
  if (!usuario) {
    notFound();
  }

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Editar usuario y permisos</h1>
        <p className="text-sm text-muted-foreground">Datos de acceso, sedes y lo que puede hacer en el sistema.</p>
      </div>

      <CabeceraUsuario
        nombre={usuario.nombre}
        email={usuario.email}
        activo={usuario.activo}
        createdAt={usuario.createdAt}
      />

      <Card>
        <CardHeader>
          <CardTitle>Editar usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <EditarUsuarioForm usuario={usuario} sedes={sedes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <TituloSeccion icono={KeyRound} tono="azul">Permisos</TituloSeccion>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usuario.role === "ADMIN" ? (
            <p className="text-sm text-muted-foreground">El administrador tiene todos los permisos</p>
          ) : (
            <PermisosUsuario
              usuarioId={usuario.id}
              role={usuario.role}
              agregados={usuario.permisosAgregados}
              quitados={usuario.permisosQuitados}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
