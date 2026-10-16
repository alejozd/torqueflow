import { AlertCircle, Clock, HandCoins, type LucideIcon } from "lucide-react";
import { getCuentasPorPagar } from "@/app/actions/cuenta-por-pagar-actions";
import { BotonExportar } from "@/components/boton-exportar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE, KpiCard, type KpiAccentColor, type KpiTone } from "@/components/ui/kpi-card";
import type { RangoAntiguedad } from "@/lib/cartera/antiguedad";
import { cn } from "@/lib/utils";
import { AbonoCuentaForm } from "./abono-cuenta-form";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

const RANGOS = [
  { clave: "0-30", etiqueta: "0 a 30 días", tono: "info", colorValor: "default", icono: Clock },
  { clave: "31-60", etiqueta: "31 a 60 días", tono: "info", colorValor: "default", icono: Clock },
  { clave: "61-90", etiqueta: "61 a 90 días", tono: "warning", colorValor: "warning", icono: Clock },
  { clave: "90+", etiqueta: "Más de 90 días", tono: "danger", colorValor: "danger", icono: AlertCircle },
] as const satisfies readonly {
  clave: RangoAntiguedad;
  etiqueta: string;
  tono: KpiTone;
  colorValor: KpiAccentColor;
  icono: LucideIcon;
}[];

function cuentas(n: number) {
  return `${n} ${n === 1 ? "cuenta" : "cuentas"}`;
}

export default async function CuentasPorPagarPage() {
  const { proveedores, totales } = await getCuentasPorPagar();
  const todas = proveedores.flatMap((proveedor) => proveedor.cuentas);
  const totalCuentas = todas.length;
  const cuentasPorRango = Object.fromEntries(
    RANGOS.map((rango) => [rango.clave, todas.filter((cuenta) => cuenta.rango === rango.clave).length]),
  ) as Record<RangoAntiguedad, number>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cuentas por pagar</h1>
          <p className="text-sm text-muted-foreground">
            Lo que el taller debe a sus proveedores. La deuda nace cuando entra la mercancía y se salda con abonos.
          </p>
        </div>
        <BotonExportar reporte="cuentas-por-pagar" etiqueta="Exportar a Excel" />
      </div>

      {/* Misma fila que Cartera: el color sube con la antigüedad de la deuda. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="Total por pagar"
          value={formatoMoneda.format(totales.total)}
          valueColor="warning"
          subtitle={
            totalCuentas === 0
              ? "Todo está pagado"
              : `${cuentas(totalCuentas)} · ${proveedores.length} ${proveedores.length === 1 ? "proveedor" : "proveedores"}`
          }
          icon={<HandCoins className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />
        {RANGOS.map((rango) => {
          const tono = KPI_TONE[rango.tono];
          const Icono = rango.icono;
          const enRango = cuentasPorRango[rango.clave];
          return (
            <KpiCard
              key={rango.clave}
              title={rango.etiqueta}
              value={formatoMoneda.format(totales[rango.clave])}
              valueColor={rango.colorValor}
              highlight={rango.clave === "90+" && totales["90+"] > 0}
              subtitle={enRango === 0 ? "Sin cuentas" : cuentas(enRango)}
              subtitleIcon={enRango === 0 ? "none" : "dot"}
              icon={<Icono className={cn("size-5", tono.icon)} />}
              iconBgColor={tono.iconBg}
              className={tono.cardBg}
            />
          );
        })}
      </div>

      {proveedores.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No hay cuentas pendientes: todo lo recibido está pagado.
          </CardContent>
        </Card>
      ) : (
        proveedores.map((proveedor) => (
          <Card key={proveedor.proveedorId}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{proveedor.proveedorNombre}</span>
                <span className="font-mono text-base">{formatoMoneda.format(proveedor.saldoTotal)}</span>
              </CardTitle>
              <CardDescription>
                {proveedor.cuentas.length} {proveedor.cuentas.length === 1 ? "cuenta" : "cuentas"} · la más antigua hace{" "}
                {proveedor.diasMasAntigua} {proveedor.diasMasAntigua === 1 ? "día" : "días"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {proveedor.cuentas.map((cuenta) => (
                <div key={cuenta.cuentaId} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      Entrada del {formatoFecha.format(cuenta.fecha)} ·{" "}
                      <span className="text-muted-foreground">total {formatoMoneda.format(cuenta.total)}</span>
                    </span>
                    <span className="font-mono font-medium">Saldo {formatoMoneda.format(cuenta.saldo)}</span>
                  </div>
                  <AbonoCuentaForm cuentaId={cuenta.cuentaId} saldo={cuenta.saldo} />
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
