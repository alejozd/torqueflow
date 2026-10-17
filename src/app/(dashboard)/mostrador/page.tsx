import Link from "next/link";
import { getMostradorDatos, obtenerVentaMostradorAction } from "@/app/actions/venta-mostrador-actions";
import { BotonExportar } from "@/components/boton-exportar";
import { cn } from "@/lib/utils";
import { PestanasMostrador } from "./pestanas-mostrador";
import { VenderMostrador } from "./vender-mostrador";
import { PanelVentas } from "./ventas/panel-ventas";

export default async function MostradorPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; venta?: string }>;
}) {
  const { tab, venta } = await searchParams;
  const { efectivoBloqueado, usarControlCaja, cajaAbierta, topeDescuento, ventas, resumen } =
    await getMostradorDatos();

  // `?venta=<id>` (Cartera → Cobrar) abre el cobro de esa venta en la pestaña Ventas,
  // aunque no sea de hoy: cobrar el saldo no tiene plazo.
  const ventaId = typeof venta === "string" && venta !== "" ? venta : null;
  const ventaEnlazada =
    ventaId && !ventas.some((fila) => fila.id === ventaId) ? await obtenerVentaMostradorAction(ventaId) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mostrador</h1>
          <p className="text-sm text-muted-foreground">
            Vende lo que hay en inventario sin abrir una orden de trabajo. El stock se descuenta al vender y el efectivo
            entra en el arqueo de la caja abierta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {usarControlCaja ? (
            <Link
              href="/caja"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                cajaAbierta
                  ? "border-[oklch(0.6_0.15_150)]/40 bg-[oklch(0.6_0.15_150)]/10 text-[oklch(0.5_0.12_150)]"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              <span
                className={cn("size-1.5 rounded-full", cajaAbierta ? "bg-[oklch(0.6_0.15_150)]" : "bg-destructive")}
                aria-hidden
              />
              {cajaAbierta ? "Caja abierta" : "Caja cerrada · Abrir caja"}
            </Link>
          ) : null}
          <BotonExportar reporte="ventas" etiqueta="Exportar ventas" />
        </div>
      </div>

      <PestanasMostrador
        inicial={tab === "ventas" || ventaId ? "ventas" : "vender"}
        ventasHoy={resumen.numeroVentas}
        solicitudInicial={ventaId ? { ventaId, accion: "cobrar", clave: 0 } : null}
        vender={
          <VenderMostrador
            efectivoBloqueado={efectivoBloqueado}
            topeDescuento={topeDescuento}
          />
        }
        ventas={<PanelVentas ventasHoy={ventas} resumen={resumen} ventaEnlazada={ventaEnlazada} />}
      />
    </div>
  );
}
