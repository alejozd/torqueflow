import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { NuevaEntradaMercanciaForm } from "../nueva-entrada-mercancia-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NuevaEntradaMercanciaPage() {
  const [proveedores, bodegas] = await Promise.all([listProveedores(), listBodegas()]);

  return (
    <main className="flex flex-col gap-6">
      <Link
        href="/entradas-mercancia"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Entradas de mercancía
      </Link>

      <h1 className="text-2xl font-semibold">Nueva entrada de mercancía</h1>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la entrada</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />
        </CardContent>
      </Card>
    </main>
  );
}
