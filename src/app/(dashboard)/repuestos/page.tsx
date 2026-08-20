import { listRepuestos } from "@/app/actions/repuesto-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { NuevoRepuestoForm } from "./nuevo-repuesto-form";

export default async function RepuestosPage() {
  const [repuestos, bodegas, proveedores] = await Promise.all([
    listRepuestos(),
    listBodegas(),
    listProveedores(),
  ]);

  return (
    <main>
      <h1>Repuestos</h1>
      <NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} />
      <ul>
        {repuestos.map((repuesto) => (
          <li key={repuesto.id}>
            {repuesto.codigo} — {repuesto.nombre} — stock: {repuesto.stockActual} — {repuesto.bodega.nombre}
            {repuesto.stockActual <= repuesto.stockMinimo ? " ⚠ stock bajo" : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
