import { listProveedores } from "@/app/actions/proveedor-actions";
import { NuevoProveedorForm } from "./nuevo-proveedor-form";

export default async function ProveedoresPage() {
  const proveedores = await listProveedores();

  return (
    <main>
      <h1>Proveedores</h1>
      <NuevoProveedorForm />
      <ul>
        {proveedores.map((proveedor) => (
          <li key={proveedor.id}>
            {proveedor.nombre} — {proveedor.telefono ?? "—"} — {proveedor.email ?? "—"}
          </li>
        ))}
      </ul>
    </main>
  );
}
