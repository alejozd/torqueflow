import { listBodegas } from "@/app/actions/bodega-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { puede, requirePermiso } from "@/lib/auth/guards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportarForm } from "./importar-form";

export default async function ImportarPage() {
  const session = await requirePermiso("importar.usar");

  // Secuencial a propósito: cada action pasa por su propio guard.
  const bodegas = await listBodegas();
  const proveedores = await listProveedores();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Importar desde Excel</h1>
        <p className="text-sm text-muted-foreground">
          Carga de una sola vez tus clientes, vehículos, repuestos y servicios desde un libro de Excel. Solo agrega: si
          un registro ya existe, se omite y se te informa cuál.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Archivo y destino</CardTitle>
          <CardDescription>
            Empieza descargando la plantilla, que trae una hoja por entidad con las columnas exactas y un ejemplo de
            cada dato.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <a
            href="/api/importacion/plantilla"
            className="text-sm font-medium text-primary underline underline-offset-4"
            download
          >
            Descargar plantilla (.xlsx)
          </a>
          <ImportarForm
            bodegas={bodegas.map((bodega) => ({ value: bodega.id, label: bodega.nombre }))}
            proveedores={proveedores.map((proveedor) => ({ value: proveedor.id, label: proveedor.nombre }))}
            esAdmin={puede(session, "servicios.gestionar")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
