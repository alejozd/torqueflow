import Link from "next/link";
import { getFrecuenciaLiquidacion, listLiquidacionesDelPeriodo } from "@/app/actions/liquidacion-actions";
import { requireRole } from "@/lib/auth/guards";
import { periodoActual, periodoAnterior, periodoSiguiente } from "@/lib/liquidaciones/periodo";
import { esPeriodoDeFrecuencia } from "@/lib/validation/liquidacion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EsquemaLiquidacionSection } from "./esquema-liquidacion-section";
import { FrecuenciaLiquidacionForm } from "./frecuencia-liquidacion-form";
import { LiquidacionesTabla } from "./liquidaciones-tabla";

export default async function LiquidacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { periodo: pedido } = await searchParams;

  const frecuencia = await getFrecuenciaLiquidacion();
  // Un periodo de la URL solo se acepta si tiene el formato de la frecuencia
  // vigente; si no, se cae al periodo en curso.
  const periodo = pedido && esPeriodoDeFrecuencia(frecuencia, pedido) ? pedido : periodoActual(frecuencia, new Date());

  const datos = await listLiquidacionesDelPeriodo(periodo);

  // El esquema de cada técnico ya viene en las filas: una sola consulta para
  // las dos tarjetas, así no pueden mostrar cosas distintas.
  const tecnicos = datos.filas.map((fila) => ({
    usuarioId: fila.usuarioId,
    nombre: fila.nombre,
    tipo: fila.tipo,
    porcentaje: fila.porcentaje,
    montoFijo: fila.montoFijo,
  }));
  const esPeriodoActual = periodo === periodoActual(frecuencia, new Date());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Liquidaciones</h1>
        <p className="text-sm text-muted-foreground">
          Lo que se le paga a cada mecánico por el trabajo que hizo en el periodo: la mano de obra de las órdenes
          entregadas, atribuida a quien hizo cada trabajo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Frecuencia</CardTitle>
          <CardDescription>Cada cuánto liquida el taller. Aplica a los periodos nuevos.</CardDescription>
        </CardHeader>
        <CardContent>
          <FrecuenciaLiquidacionForm frecuencia={frecuencia} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Producción y liquidación del periodo</CardTitle>
          <CardDescription>
            Órdenes entregadas dentro de la ventana del periodo, trabajos (líneas de mano de obra) y lo que le
            corresponde a cada técnico según su esquema.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/liquidaciones?periodo=${periodoAnterior(frecuencia, periodo)}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              ← Anterior
            </Link>
            <span className="text-sm font-medium">{datos.etiqueta}</span>
            <Link
              href={`/liquidaciones?periodo=${periodoSiguiente(frecuencia, periodo)}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Siguiente →
            </Link>
            {!esPeriodoActual ? (
              <Link href="/liquidaciones" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                Periodo actual
              </Link>
            ) : null}
          </div>

          {datos.error ? (
            <Alert variant="destructive">
              <AlertDescription>{datos.error}</AlertDescription>
            </Alert>
          ) : (
            <LiquidacionesTabla filas={datos.filas} periodo={datos.periodo} etiquetaPeriodo={datos.etiqueta} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Esquema de pago por técnico</CardTitle>
          <CardDescription>
            Porcentaje de su mano de obra, base fija por periodo, o las dos. Un técnico sin esquema no se liquida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EsquemaLiquidacionSection tecnicos={tecnicos} />
        </CardContent>
      </Card>
    </div>
  );
}
