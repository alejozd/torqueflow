import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LiquidacionesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Liquidaciones</h1>
        <Skeleton className="h-4 w-96" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Frecuencia</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-9 w-full max-w-md" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Producción y liquidación del periodo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Esquema de pago por técnico</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
    </div>
  );
}
