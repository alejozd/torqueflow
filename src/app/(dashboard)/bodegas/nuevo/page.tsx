import { NuevoBodegaForm } from "../nuevo-bodega-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NuevaBodegaPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Nueva bodega</h1>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la bodega</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoBodegaForm />
        </CardContent>
      </Card>
    </main>
  );
}
