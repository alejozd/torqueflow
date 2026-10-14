import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { diaLargo, pesosCompactos, type DiaFacturacion, type ResumenFacturacion } from "@/lib/dashboard/facturacion-semana";
import { cn } from "@/lib/utils";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoDiaCorto = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", timeZone: "UTC" });

// Paleta validada con el script de la guía de visualización (claro sobre #fcfcfb,
// oscuro sobre #272727): verde = cobrado (el color del dinero en la app), ámbar =
// pendiente (el de la cartera). El ámbar claro no llega a 3:1 contra el fondo, así
// que nunca va solo: leyenda, cifras en texto y tabla.
const COLOR = {
  cobrado: "bg-[#2f8f5b] dark:bg-[#1f7f55]",
  pendiente: "bg-[#e0a030] dark:bg-[#c08220]",
} as const;

/** Tope del eje redondeado a 1, 2, 2,5 o 5 × 10^n, con 4 divisiones limpias. */
function topeDelEje(maximo: number): number {
  if (maximo <= 0) return 1;
  const paso = maximo / 4;
  const magnitud = 10 ** Math.floor(Math.log10(paso));
  const limpio = [1, 2, 2.5, 5, 10].find((factor) => factor * magnitud >= paso)! * magnitud;
  return limpio * 4;
}

function etiquetaDia(fecha: string, esHoy: boolean): string {
  return esHoy ? "hoy" : formatoDiaCorto.format(new Date(`${fecha}T12:00:00.000Z`));
}

function Muestra({ className }: { className: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-[3px]", className)} />;
}

function Variacion({ variacion }: { variacion: number | null }) {
  if (variacion === null) return <span className="text-xs text-muted-foreground">sin semana anterior para comparar</span>;
  const Icono = variacion > 0 ? ArrowUpRight : variacion < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Icono aria-hidden className={cn("size-3.5", variacion > 0 ? "text-[#2f8f5b]" : variacion < 0 ? "text-destructive" : "")} />
      {variacion === 0 ? "igual" : `${variacion > 0 ? "+" : "−"}${Math.abs(variacion)} %`} vs. 7 días anteriores
    </span>
  );
}

function Columna({ dia, tope, esHoy, rotular }: { dia: DiaFacturacion; tope: number; esHoy: boolean; rotular: boolean }) {
  const alto = (valor: number) => `${(valor / tope) * 100}%`;
  const descripcion = `${diaLargo(dia.fecha)}: ${formatoMoneda.format(dia.total)} en ${dia.facturas} ${dia.facturas === 1 ? "factura" : "facturas"} (cobrado ${formatoMoneda.format(dia.cobrado)}, pendiente ${formatoMoneda.format(dia.pendiente)})`;

  return (
    // Toda la columna es el área de hover/foco: más grande que la barra.
    <div tabIndex={0} aria-label={descripcion} className="group relative flex h-full flex-col items-center justify-end outline-none">
      {rotular && dia.total > 0 ? (
        <span className="relative z-20 mb-1 rounded bg-card px-1 text-[11px] font-medium whitespace-nowrap text-foreground tabular-nums">
          {pesosCompactos(dia.total)}
        </span>
      ) : null}
      {/* Pila: pendiente arriba, cobrado en la base; 2 px de separación y punta redondeada. */}
      <div className="flex w-6 flex-col gap-[2px]" style={{ height: alto(dia.total) }}>
        {dia.pendiente > 0 ? (
          <div className={cn("w-full rounded-t-[4px]", COLOR.pendiente)} style={{ flexGrow: dia.pendiente }} />
        ) : null}
        {dia.cobrado > 0 ? (
          <div className={cn("w-full", dia.pendiente > 0 ? "" : "rounded-t-[4px]", COLOR.cobrado)} style={{ flexGrow: dia.cobrado }} />
        ) : null}
      </div>

      <div
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-48 -translate-x-1/2 rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
      >
        <p className="mb-1.5 font-medium capitalize">{diaLargo(dia.fecha)}</p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="text-right font-medium">{formatoMoneda.format(dia.total)}</dd>
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <Muestra className={COLOR.cobrado} /> Cobrado
          </dt>
          <dd className="text-right">{formatoMoneda.format(dia.cobrado)}</dd>
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <Muestra className={COLOR.pendiente} /> Pendiente
          </dt>
          <dd className="text-right">{formatoMoneda.format(dia.pendiente)}</dd>
          <dt className="text-muted-foreground">Facturas</dt>
          <dd className="text-right">{dia.facturas}</dd>
        </dl>
      </div>
      <span className="sr-only">{esHoy ? "(hoy)" : ""}</span>
    </div>
  );
}

/**
 * Facturación de la semana en el Inicio: cifras de la semana, barras por día
 * (cobrado y pendiente), promedio diario, una lectura en frases y la tabla.
 */
export function FacturacionSemanaCard({ resumen }: { resumen: ResumenFacturacion }) {
  const maximo = Math.max(0, ...resumen.dias.map((dia) => dia.total));
  const tope = topeDelEje(maximo);
  const marcas = [4, 3, 2, 1, 0].map((paso) => (tope / 4) * paso);
  const hoy = resumen.dias.at(-1)?.fecha;

  return (
    <Card id="facturacion" className="scroll-mt-16">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <CardTitle>Facturación · últimos 7 días</CardTitle>
        <ul aria-label="Leyenda" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <Muestra className={COLOR.cobrado} /> Cobrado
          </li>
          <li className="flex items-center gap-1.5">
            <Muestra className={COLOR.pendiente} /> Pendiente
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4 rounded-full bg-foreground/50" /> Promedio diario
            {resumen.total > 0 ? <span className="tabular-nums">· {pesosCompactos(resumen.promedioDiario)}</span> : null}
          </li>
        </ul>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Facturado</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums">{formatoMoneda.format(resumen.total)}</dd>
            <dd>
              <Variacion variacion={resumen.variacion} />
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Muestra className={COLOR.cobrado} /> Cobrado
            </dt>
            <dd className="font-mono text-lg font-semibold tabular-nums">{formatoMoneda.format(resumen.cobrado)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Muestra className={COLOR.pendiente} /> Pendiente
            </dt>
            <dd className="font-mono text-lg font-semibold tabular-nums">{formatoMoneda.format(resumen.pendiente)}</dd>
            {resumen.facturasPendientes > 0 ? (
              <dd className="text-xs text-muted-foreground">
                en {resumen.facturasPendientes} {resumen.facturasPendientes === 1 ? "factura" : "facturas"}
              </dd>
            ) : null}
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Promedio diario</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums">{formatoMoneda.format(resumen.promedioDiario)}</dd>
            <dd className="text-xs text-muted-foreground">
              {resumen.facturas} {resumen.facturas === 1 ? "factura" : "facturas"} en la semana
            </dd>
          </div>
        </dl>

        <div className="flex gap-2" aria-hidden={resumen.total === 0}>
          {/* Eje Y: valores redondos, compactos. */}
          <div className="relative h-44 w-14 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
            {marcas.map((valor) => (
              <span key={valor} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (valor / tope) * 100}%` }}>
                {pesosCompactos(valor)}
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="relative h-44">
              {/* Rejilla: líneas finas y discretas. */}
              {marcas.map((valor) => (
                <div
                  key={valor}
                  aria-hidden
                  className={cn("absolute inset-x-0 h-px", valor === 0 ? "bg-border" : "bg-border/50")}
                  style={{ top: `${100 - (valor / tope) * 100}%` }}
                />
              ))}
              {resumen.total > 0 ? (
                <div
                  aria-hidden
                  // Sin rótulo dentro del gráfico: chocaba con la cifra de la última barra.
                  // El valor va en la leyenda y en las cifras de arriba.
                  className="absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-foreground/50"
                  style={{ top: `${100 - (resumen.promedioDiario / tope) * 100}%` }}
                />
              ) : null}
              <div className="absolute inset-0 grid grid-cols-7">
                {resumen.dias.map((dia) => (
                  <Columna
                    key={dia.fecha}
                    dia={dia}
                    tope={tope}
                    esHoy={dia.fecha === hoy}
                    // Cifra sobre la barra solo en el mejor día y en hoy; el resto, en el detalle y la tabla.
                    rotular={dia.fecha === resumen.mejorDia?.fecha || dia.fecha === hoy}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
              {resumen.dias.map((dia) => (
                <span key={dia.fecha} className={cn(dia.fecha === hoy && "font-semibold text-foreground")}>
                  {etiquetaDia(dia.fecha, dia.fecha === hoy)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <section aria-labelledby="lectura-facturacion" className="rounded-lg border bg-muted/40 p-3">
          <h3 id="lectura-facturacion" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
            <Sparkles aria-hidden className="size-4 text-primary" /> Lectura de la semana
          </h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground marker:text-border">
            {resumen.lecturas.map((lectura) => (
              <li key={lectura}>{lectura}</li>
            ))}
          </ul>
        </section>

        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Ver los datos en tabla</summary>
          <table className="mt-2 w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-1 text-left font-medium">Día</th>
                <th className="py-1 text-right font-medium">Facturas</th>
                <th className="py-1 text-right font-medium">Cobrado</th>
                <th className="py-1 text-right font-medium">Pendiente</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {resumen.dias.map((dia) => (
                <tr key={dia.fecha} className="border-b border-border/50">
                  <td className="py-1 capitalize">{diaLargo(dia.fecha)}</td>
                  <td className="py-1 text-right">{dia.facturas}</td>
                  <td className="py-1 text-right">{formatoMoneda.format(dia.cobrado)}</td>
                  <td className="py-1 text-right">{formatoMoneda.format(dia.pendiente)}</td>
                  <td className="py-1 text-right font-medium">{formatoMoneda.format(dia.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </CardContent>
    </Card>
  );
}
