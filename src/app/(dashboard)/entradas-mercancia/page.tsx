import Link from "next/link";
import { listEntradas } from "@/app/actions/entrada-mercancia-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { NuevaEntradaMercanciaForm } from "./nueva-entrada-mercancia-form";

export default async function EntradasMercanciaPage() {
  const [entradas, proveedores, bodegas] = await Promise.all([
    listEntradas(),
    listProveedores(),
    listBodegas(),
  ]);

  return (
    <main>
      <h1>Entradas de mercancía</h1>
      <NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />
      <ul>
        {entradas.map((entrada) => (
          <li key={entrada.id}>
            <Link href={`/entradas-mercancia/${entrada.id}`}>
              {new Date(entrada.createdAt).toLocaleDateString()} — {entrada.proveedor.nombre} —{" "}
              {entrada.bodega.nombre} — {entrada.items.length} ítem(s)
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
