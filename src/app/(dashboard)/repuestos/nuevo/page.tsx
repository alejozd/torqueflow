import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listBodegas } from "@/app/actions/bodega-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { NuevoRepuestoForm } from "../nuevo-repuesto-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NuevoRepuestoPage() {
  const [bodegas, proveedores] = await Promise.all([listBodegas(), listProveedores()]);

  return (
    <main className="flex flex-col gap-6">
      <Link href="/repuestos" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Repuestos
      </Link>

      <h1 className="text-2xl font-semibold">Nuevo repuesto</h1>

      <Card>
        <CardHeader>
          <CardTitle>Datos del repuesto</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} />
        </CardContent>
      </Card>
    </main>
  );
}
