import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NuevoBodegaForm } from "../nuevo-bodega-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NuevaBodegaPage() {
  return (
    <main className="flex flex-col gap-6">
      <Link href="/bodegas" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Bodegas
      </Link>

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
