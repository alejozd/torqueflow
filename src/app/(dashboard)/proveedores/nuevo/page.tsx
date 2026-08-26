import { NuevoProveedorForm } from "../nuevo-proveedor-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NuevoProveedorPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Nuevo proveedor</h1>

      <Card>
        <CardHeader>
          <CardTitle>Datos del proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoProveedorForm />
        </CardContent>
      </Card>
    </main>
  );
}
