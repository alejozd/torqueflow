import Link from "next/link";
import { getFrecuenciaLiquidacion, listLiquidacionesDelPeriodo } from "@/app/actions/liquidacion-actions";
import { requirePermiso } from "@/lib/auth/guards";
import { frecuenciaDePeriodo, periodoActual, periodoAnterior, periodoSiguiente } from "@/lib/liquidaciones/periodo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EsquemaLiquidacionSection } from "./esquema-liquidacion-section";
import { FrecuenciaLiquidacionForm } from "./frecuencia-liquidacion-form";
import { LiquidacionesTabla } from "./liquidaciones-tabla";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });

export default async function LiquidacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requirePermiso("liquidaciones.gestionar");
  const { periodo: pedido } = await searchParams;

  const frecuenciaConfigurada = await getFrecuenciaLiquidacion();
  // Cualquier periodo bien formado se puede consultar, aunque su frecuencia ya
  // no sea la del taller: si no, las liquidaciones de la frecuencia anterior
  // quedarían imposibles de ver (y de pagar).
  const frecuenciaDelPedido = pedido ? frecuenciaDePeriodo(pedido) : null;
  const frecuencia = frecuenciaDelPedido ?? frecuenciaConfigurada;
  const periodo = frecuenciaDelPedido && pedido ? pedido : periodoActual(frecuenciaConfigurada, new Date());

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
            corresponde a cada técnico según su esquema. Se paga desde cada fila: el pago guarda el cálculo de ese
            momento y entra como gasto de la sede.
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
            <>
              {datos.sinAsignar && datos.sinAsignar.trabajos > 0 ? (
                <Alert>
                  <AlertDescription>
                    {datos.sinAsignar.trabajos === 1 ? "Hay 1 trabajo" : `Hay ${datos.sinAsignar.trabajos} trabajos`} sin
                    mecánico asignado en este periodo (
                    {formatoMoneda.format(datos.sinAsignar.montoManoObra)} de mano de obra): eso no se le liquida a
                    nadie. Asígnalo en las órdenes si quieres pagarlo.
                  </AlertDescription>
                </Alert>
              ) : null}
              <LiquidacionesTabla filas={datos.filas} periodo={datos.periodo} etiquetaPeriodo={datos.etiqueta} />
            </>
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
