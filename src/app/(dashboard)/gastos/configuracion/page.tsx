import Link from "next/link";
import { listCategoriasGasto } from "@/app/actions/categoria-gasto-actions";
import { listPlantillasRecurrentes } from "@/app/actions/gasto-recurrente-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/guards";
import { CategoriasGastoSection } from "./categorias-gasto-section";
import { PlantillasRecurrentesSection } from "./plantillas-recurrentes-section";

export default async function GastosConfiguracionPage() {
  const session = await requireRole(["ADMIN"]);
  // Secuencial: cada action pasa por requireRole, que hace redirect() lanzando.
  const categorias = await listCategoriasGasto();
  const categoriasActivas = await listCategoriasGasto({ soloActivas: true });
  const plantillas = await listPlantillasRecurrentes();
  const sedes = await listSedes();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/gastos" className="text-sm text-muted-foreground hover:underline">
          ← Volver a Gastos
        </Link>
        <h1 className="text-2xl font-semibold">Configuración de gastos</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gastos recurrentes</CardTitle>
        </CardHeader>
        <CardContent>
          <PlantillasRecurrentesSection
            plantillas={plantillas}
            categorias={categoriasActivas}
            sedes={sedes.map((s) => ({ id: s.id, nombre: s.nombre }))}
            sedeIdPorDefecto={session.user.sedeActivaId}
          />
        </CardContent>
      </Card>
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
