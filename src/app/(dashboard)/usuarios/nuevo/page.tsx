import { NuevoUsuarioForm } from "./nuevo-usuario-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NuevoUsuarioPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Crear usuario</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoUsuarioForm />
        </CardContent>
      </Card>
    </main>
  );
}
