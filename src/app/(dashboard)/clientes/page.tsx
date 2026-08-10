import Link from "next/link";
import { listClientes } from "@/app/actions/cliente-actions";
import { NuevoClienteForm } from "./nuevo-cliente-form";

export default async function ClientesPage() {
  const clientes = await listClientes();

  return (
    <main>
      <h1>Clientes</h1>
      <NuevoClienteForm />
      <ul>
        {clientes.map((cliente) => (
          <li key={cliente.id}>
            <Link href={`/clientes/${cliente.id}`}>{cliente.nombre}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
