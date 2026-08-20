import { listBodegas } from "@/app/actions/bodega-actions";
import { NuevoBodegaForm } from "./nuevo-bodega-form";

export default async function BodegasPage() {
  const bodegas = await listBodegas();

  return (
    <main>
      <h1>Bodegas</h1>
      <NuevoBodegaForm />
      <ul>
        {bodegas.map((bodega) => (
          <li key={bodega.id}>{bodega.nombre}</li>
        ))}
      </ul>
    </main>
  );
}
