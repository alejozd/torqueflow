import Link from "next/link";
import { listUsuariosConSedes } from "@/app/actions/usuario-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { AsignarSedesForm } from "./asignar-sedes-form";

const ROLE_LABELS: Record<"ADMIN" | "TECNICO" | "RECEPCION", string> = {
  ADMIN: "Administrador",
  TECNICO: "Técnico",
  RECEPCION: "Recepción",
};

export default async function UsuariosPage() {
  // Sequential, not Promise.all: both calls go through requireRole, which
  // redirect()s by throwing. Racing two throwing guards is the pattern Fase 5
  // Task 9 deliberately avoided on /reportes.
  const usuarios = await listUsuariosConSedes();
  const sedes = await listSedes();

  return (
    <main>
      <h1>Usuarios</h1>
      <p>
        Un administrador puede trabajar en cualquier sede aunque no esté asignado a ella.
      </p>
      <Link href="/usuarios/nuevo">Crear usuario</Link>
      <ul>
        {usuarios.map((usuario) => (
          <li key={usuario.id}>
            <h2>{usuario.nombre}</h2>
            <p>
              {usuario.email} — {ROLE_LABELS[usuario.role]}
            </p>
            <Link href={`/usuarios/${usuario.id}`}>Editar</Link>
            <AsignarSedesForm
              usuario={usuario}
              sedes={sedes.map((sede) => ({ id: sede.id, nombre: sede.nombre }))}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
