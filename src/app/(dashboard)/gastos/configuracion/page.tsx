import Link from "next/link";
import { listCategoriasGasto } from "@/app/actions/categoria-gasto-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/guards";
import { CategoriasGastoSection } from "./categorias-gasto-section";

export default async function GastosConfiguracionPage() {
  await requireRole(["ADMIN"]);
  const categorias = await listCategoriasGasto();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/gastos" className="text-sm text-muted-foreground hover:underline">
          ← Volver a Gastos
        </Link>
        <h1 className="text-2xl font-semibold">Configuración de gastos</h1>
      </div>

      {/* Fase 16 Task 5: la tarjeta "Gastos recurrentes" va aquí, arriba de Categorías. */}
      <Card>
        <CardHeader>
          <CardTitle>Categorías</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoriasGastoSection categorias={categorias} />
        </CardContent>
      </Card>
    </div>
  );
}
