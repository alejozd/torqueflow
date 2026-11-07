import { requirePermiso } from "@/lib/auth/guards";
import { listTarifasIva } from "@/app/actions/tarifa-iva-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TarifasIvaPanel } from "./tarifas-iva-panel";

export default async function ConfiguracionIvaPage() {
  // Quien no tenga el permiso es redirigido a /sin-permiso antes de renderizar.
  await requirePermiso("configuracion.taller");
  const tarifas = await listTarifasIva();

  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tarifas de IVA</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Los porcentajes que se pueden elegir en cada línea de una cotización, una orden o una venta del mostrador.
          La predeterminada es la que reciben las líneas nuevas cuando el repuesto o servicio no trae la suya. Cada
          documento guarda el porcentaje que usó: desactivar o renombrar una tarifa no cambia lo ya hecho.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Tarifas</CardTitle>
        </CardHeader>
        <CardContent>
          <TarifasIvaPanel tarifas={tarifas} />
        </CardContent>
      </Card>
    </main>
  );
}
