import Link from "next/link";
import { ArrowUpRight, Truck } from "lucide-react";
import { TituloSeccion } from "@/components/titulo-seccion";
import { Card } from "@/components/ui/card";
import type { CuentaConAntiguedad, ProveedorCuentas } from "@/lib/proveedores/cuentas-por-pagar";
import { cn } from "@/lib/utils";
import { BotonAbonar } from "./abonos-contexto";
import { HistorialAbonos } from "./historial-abonos";
import {
  esDeHoy,
  etiquetaAntiguedad,
  etiquetaMetodo,
  fechaCuenta,
  fechaHoraPago,
  pesos,
  plural,
  puntoAntiguedad,
  TEXTO_VERDE,
} from "./presentacion";

/**
 * La lista de cuentas por pagar: una tarjeta por proveedor y una fila por
 * entrada. Solo muestra datos; abonar se hace desde el diálogo de cada fila.
 */
export function ProveedorCuentasLista({
  proveedores,
  abonadas = [],
}: {
  proveedores: ProveedorCuentas[];
  /** Cuentas recién abonadas: se resaltan en verde y, si quedaron pagadas, dicen «✓ Pagada». */
  abonadas?: string[];
}) {
  const ahora = new Date();
  return (
    <div className="flex flex-col gap-3">
      {proveedores.map((proveedor) => (
        <TarjetaProveedor key={proveedor.proveedorId} proveedor={proveedor} ahora={ahora} abonadas={abonadas} />
      ))}
    </div>
  );
}

function TarjetaProveedor({
  proveedor,
  ahora,
  abonadas,
}: {
  proveedor: ProveedorCuentas;
  ahora: Date;
  abonadas: string[];
}) {
  const porPagar = proveedor.cuentas.filter((cuenta) => cuenta.saldo > 0).length;
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <TituloSeccion icono={Truck} tono="azul">
            {proveedor.proveedorNombre}
          </TituloSeccion>
          <p className="mt-0.5 pl-[2.625rem] text-xs text-muted-foreground">
            {plural(porPagar, "entrada", "entradas")} por pagar · la más vieja hace{" "}
            {plural(proveedor.diasMasAntigua, "día", "días")}
          </p>
        </div>
        <div className="flex items-center gap-2.5 max-sm:w-full max-sm:justify-between">
          {/* Bloque teñido: la cifra clave del proveedor. */}
          <div className="rounded-lg bg-[oklch(0.75_0.15_70/0.14)] px-3 py-1 text-right">
            <span className="block text-[11px] text-muted-foreground">Le debes</span>
            <span className="font-mono text-[15px] font-semibold tabular-nums">{pesos(proveedor.saldoTotal)}</span>
          </div>
        </div>
      </div>
      <ul className="divide-y">
        {proveedor.cuentas.map((cuenta) => (
          <FilaCuenta
            key={cuenta.cuentaId}
            cuenta={cuenta}
            ahora={ahora}
            recienAbonada={abonadas.includes(cuenta.cuentaId)}
          />
        ))}
      </ul>
    </Card>
  );
}

function FilaCuenta({
  cuenta,
  ahora,
  recienAbonada,
}: {
  cuenta: CuentaConAntiguedad;
  ahora: Date;
  recienAbonada: boolean;
}) {
  const porcentaje = cuenta.total > 0 ? Math.min(100, Math.round((cuenta.pagado / cuenta.total) * 100)) : 100;
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-2.5",
        "md:grid-cols-[minmax(0,2.3fr)_118px_minmax(0,1.6fr)_120px_104px] md:gap-x-3.5",
        recienAbonada && "bg-[oklch(0.65_0.15_150/0.12)]",
      )}
    >
      <div className="col-span-2 min-w-0 md:col-span-1">
        <Link
          href={`/entradas-mercancia/${cuenta.entrada.id}`}
          className="inline-flex items-center gap-1 font-medium hover:text-primary hover:underline"
          title="Ver la entrada de mercancía"
        >
          Entrada del {fechaCuenta(cuenta.fecha)}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
        <p className="truncate text-xs text-muted-foreground" title={cuenta.entrada.resumen}>
          {plural(cuenta.entrada.referencias, "referencia", "referencias")} · {cuenta.entrada.resumen}
        </p>
        {recienAbonada ? (
          <span className={cn("text-xs font-semibold", TEXTO_VERDE)}>✓ Abono registrado hace un momento</span>
        ) : null}
      </div>

      <div>
        <Chip punto={puntoAntiguedad(cuenta.dias)}>{etiquetaAntiguedad(cuenta.dias)}</Chip>
      </div>

      <div className="col-span-2 md:col-span-1 max-md:order-last">
        <BarraPagado pagado={cuenta.pagado} total={cuenta.total} porcentaje={porcentaje} />
      </div>

      <div className="text-right">
        <span className="block text-[11px] text-muted-foreground">Debe</span>
        <span className="font-mono font-semibold tabular-nums">{pesos(cuenta.saldo)}</span>
      </div>

      <div className="col-span-2 flex justify-end md:col-span-1 max-md:order-last">
        {cuenta.saldo > 0 ? (
          <BotonAbonar
            cuenta={{
              cuentaId: cuenta.cuentaId,
              proveedorNombre: cuenta.proveedorNombre,
              entradaId: cuenta.entrada.id,
              fechaTexto: fechaCuenta(cuenta.fecha),
              referencias: cuenta.entrada.referencias,
              total: cuenta.total,
              pagado: cuenta.pagado,
              saldo: cuenta.saldo,
            }}
          />
        ) : (
          <span className={cn("inline-flex items-center gap-1 font-semibold", TEXTO_VERDE)}>✓ Pagada</span>
        )}
      </div>

      {cuenta.pagos.length > 0 ? (
        <div className="col-span-full max-md:order-last">
          <HistorialAbonos
            abonos={cuenta.pagos.map((pago) => ({
              id: pago.id,
              cuando: fechaHoraPago(pago.createdAt, ahora),
              monto: pago.monto,
              metodo: etiquetaMetodo(pago.metodoPago),
              referencia: pago.referencia,
              registradoPor: pago.registradoPor,
            }))}
            abiertoInicial={cuenta.pagos[0] ? esDeHoy(cuenta.pagos[0].createdAt, ahora) : false}
          />
        </div>
      ) : null}
    </li>
  );
}

export function Chip({ punto, children }: { punto: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-xs whitespace-nowrap">
      <span className={cn("size-1.5 shrink-0 rounded-full", punto)} aria-hidden />
      {children}
    </span>
  );
}

function BarraPagado({ pagado, total, porcentaje }: { pagado: number; total: number; porcentaje: number }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">
        {pagado > 0 ? (
          <>
            Pagado <b className="font-mono font-semibold text-foreground tabular-nums">{pesos(pagado)}</b> de{" "}
            <span className="font-mono tabular-nums">{pesos(total)}</span>
          </>
        ) : (
          <>
            Sin abonos · total <span className="font-mono tabular-nums">{pesos(total)}</span>
          </>
        )}
      </p>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]"
        role="progressbar"
        aria-label="Pagado de esta entrada"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
      >
        <div className="h-full rounded-full bg-[oklch(0.6_0.17_150)]" style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  );
}
