import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NuevoProveedorForm } from "../nuevo-proveedor-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NuevoProveedorPage() {
  return (
    <main className="flex flex-col gap-6">
      <Link href="/proveedores" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Proveedores
      </Link>

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
