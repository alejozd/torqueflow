import { listSedes } from "@/app/actions/sede-actions";
import { NuevaSedeForm } from "./nueva-sede-form";
import { EditarSedeForm } from "./editar-sede-form";

export default async function SedesPage() {
  const sedes = await listSedes();

  return (
    <main>
      <h1>Sedes</h1>
      <NuevaSedeForm />
      <ul>
        {sedes.map((sede) => (
          <li key={sede.id}>
            <h2>{sede.nombre}</h2>
            {sede.direccion ? <p>{sede.direccion}</p> : null}
            <EditarSedeForm sede={sede} />
          </li>
        ))}
      </ul>
    </main>
  );
}
