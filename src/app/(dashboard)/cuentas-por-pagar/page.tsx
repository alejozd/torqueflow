import Link from "next/link";
import { AlertCircle, Clock, HandCoins, TriangleAlert, type LucideIcon } from "lucide-react";
import { getCuentasPorPagar, type FiltroCuentasPorPagar } from "@/app/actions/cuenta-por-pagar-actions";
import { BotonExportar } from "@/components/boton-exportar";
import { Card, CardContent } from "@/components/ui/card";
import { KPI_TONE, KpiCard, type KpiAccentColor, type KpiTone } from "@/components/ui/kpi-card";
import type { RangoAntiguedad } from "@/lib/cartera/antiguedad";
import { DIAS_URGENTE, lecturaUrgente } from "@/lib/proveedores/cuentas-por-pagar";
import { cn } from "@/lib/utils";
import { pesos, plural, PUNTO } from "./presentacion";
import { ProveedorCuentasLista } from "./proveedor-cuentas";

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

/** «Terpel (73 días), Gates (70) y Andina (69)»: hasta tres nombres y el resto contado. */
function nombresUrgentes(proveedores: { nombre: string; dias: number }[]): string {
  const nombrados = proveedores
    .slice(0, 3)
    .map((proveedor, indice) => `${proveedor.nombre} (${indice === 0 ? plural(proveedor.dias, "día", "días") : proveedor.dias})`);
  const resto = proveedores.length - nombrados.length;
  if (resto > 0) return `${nombrados.join(", ")} y ${plural(resto, "proveedor más", "proveedores más")}`;
  if (nombrados.length === 1) return nombrados[0]!;
  return `${nombrados.slice(0, -1).join(", ")} y ${nombrados.at(-1)}`;
}

export default async function CuentasPorPagarPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const filtro: FiltroCuentasPorPagar = tab === "pagadas" ? "pagadas" : "pendientes";
  const { proveedores, totales, pagadas, conteoPagadas } = await getCuentasPorPagar({ filtro });
  // Solo lo que tiene saldo cuenta para los KPI (una cuenta recién saldada puede seguir en la lista).
  const todas = proveedores.flatMap((proveedor) => proveedor.cuentas).filter((cuenta) => cuenta.saldo > 0);
  const totalCuentas = todas.length;
  const cuentasPorRango = Object.fromEntries(
    RANGOS.map((rango) => [rango.clave, todas.filter((cuenta) => cuenta.rango === rango.clave).length]),
  ) as Record<RangoAntiguedad, number>;
  const urgente = lecturaUrgente(proveedores);
  const lista = filtro === "pagadas" ? (pagadas ?? []) : proveedores;

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
          value={pesos(totales.total)}
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
              value={pesos(totales[rango.clave])}
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

      {/* Lectura en lenguaje sencillo: qué atender primero. */}
      {urgente.entradas > 0 ? (
        <p role="note" className="-mt-2 flex items-start gap-2 rounded-lg bg-[oklch(0.75_0.15_70/0.14)] px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[oklch(0.66_0.16_60)]" aria-hidden />
          <span>
            <b className="font-semibold">Lo más urgente:</b>{" "}
            {urgente.entradas === 1 ? "1 entrada pasa" : `${urgente.entradas} entradas pasan`} de {DIAS_URGENTE} días y{" "}
            {urgente.entradas === 1 ? "debe" : "suman"} <b className="font-mono font-semibold">{pesos(urgente.suma)}</b> —{" "}
            {nombresUrgentes(urgente.proveedores)}. Para abonar, toca <b className="font-semibold">Abonar</b> en la
            entrada que vas a pagar.
          </span>
        </p>
      ) : totalCuentas > 0 ? (
        <p role="note" className="-mt-2 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          <span className={cn("size-1.5 shrink-0 rounded-full", PUNTO.verde)} aria-hidden />
          Ninguna entrada pasa de {DIAS_URGENTE} días. Para abonar, toca Abonar en la entrada que vas a pagar.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="Filtro" className="flex gap-1 self-start rounded-xl border border-border bg-muted p-1">
            <PestanaFiltro href="/cuentas-por-pagar" activa={filtro === "pendientes"} conteo={totalCuentas}>
              Pendientes
            </PestanaFiltro>
            <PestanaFiltro href="/cuentas-por-pagar?tab=pagadas" activa={filtro === "pagadas"} conteo={conteoPagadas}>
              Pagadas · 30 días
            </PestanaFiltro>
          </nav>
          {filtro === "pendientes" && lista.length > 0 ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", PUNTO.gris)} aria-hidden />
              Ordenado por lo que más se debe · las entradas más viejas primero
            </span>
          ) : null}
        </div>

        {lista.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No hay cuentas pendientes: todo lo recibido está pagado.
            </CardContent>
          </Card>
        ) : (
          <ProveedorCuentasLista proveedores={lista} />
        )}
      </div>
    </div>
  );
}

function PestanaFiltro({
  href,
  activa,
  conteo,
  children,
}: {
  href: string;
  activa: boolean;
  conteo: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={activa ? "page" : undefined}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors",
        activa ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
      )}
    >
      {children}
      <span className="rounded-full bg-foreground/[0.07] px-1.5 text-xs font-medium tabular-nums">{conteo}</span>
    </Link>
  );
}
