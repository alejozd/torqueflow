"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ClipboardCopy, PackageCheck, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import type { AlertaInventarioRow, AlertasInventario, SeveridadAlerta } from "@/lib/dashboard/alertas-inventario";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatoPlaca } from "@/lib/placa";
import { cn } from "@/lib/utils";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoFecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });

const SEVERIDAD: Record<SeveridadAlerta, { label: string; dot: string; stroke: string }> = {
  SIN_DISPONIBLE: { label: "sin disponible", dot: "bg-red-500", stroke: "stroke-red-500" },
  CRITICO: { label: "críticos", dot: "bg-amber-500", stroke: "stroke-amber-500" },
  BAJO_MINIMO: { label: "bajo mínimo", dot: "bg-yellow-400", stroke: "stroke-yellow-400" },
};

const CHIP = {
  danger: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  info: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  success: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
} as const;

type Pestana = "proveedor" | "urgencia" | "ordenes";

/** Rows shown per list (urgencia/ordenes) or per proveedor group before "Mostrar todas". */
const LIMITE_URGENCIA = 8;
const LIMITE_POR_PROVEEDOR = 4;
const SIN_PROVEEDOR = "sin-proveedor";

interface GrupoProveedor {
  key: string;
  nombre: string;
  proveedorId: string | null;
  alertas: AlertaInventarioRow[];
}

function agruparPorProveedor(alertas: AlertaInventarioRow[]): GrupoProveedor[] {
  const grupos = new Map<string, GrupoProveedor>();
  for (const alerta of alertas) {
    const key = alerta.proveedor?.id ?? SIN_PROVEEDOR;
    const grupo = grupos.get(key);
    if (grupo) grupo.alertas.push(alerta);
    else grupos.set(key, { key, nombre: alerta.proveedor?.nombre ?? "Sin proveedor asignado", proveedorId: alerta.proveedor?.id ?? null, alertas: [alerta] });
  }
  // Groups keep the urgency order of their first row; "Sin proveedor" always last.
  return [...grupos.values()].sort((a, b) => Number(a.key === SIN_PROVEEDOR) - Number(b.key === SIN_PROVEEDOR));
}

/** Dashboard link into Entradas de mercancía with the dialog open and preselected. */
function hrefNuevaEntrada(grupo: GrupoProveedor): string {
  const params = new URLSearchParams({ nueva: "1" });
  if (grupo.proveedorId) params.set("proveedorId", grupo.proveedorId);
  const bodegas = new Set(grupo.alertas.map((alerta) => alerta.bodega.id));
  if (bodegas.size === 1) params.set("bodegaId", [...bodegas][0]);
  return `/entradas-mercancia?${params.toString()}`;
}

function textoPedido(alertas: AlertaInventarioRow[], cantidades: Record<string, number>): string {
  return agruparPorProveedor(alertas)
    .map((grupo) =>
      [
        `Pedido para ${grupo.nombre}:`,
        ...grupo.alertas.map((alerta) => `- ${cantidades[alerta.id] ?? alerta.cantidadSugerida} x ${alerta.nombre} (${alerta.codigo})`),
      ].join("\n"),
    )
    .join("\n\n");
}

function AnilloDisponible({ alerta }: { alerta: AlertaInventarioRow }) {
  const radio = 17;
  const circunferencia = 2 * Math.PI * radio;
  const libre = Math.max(0, alerta.disponible);
  const proporcion = alerta.stockMinimo > 0 ? Math.min(1, libre / alerta.stockMinimo) : libre > 0 ? 1 : 0;
  return (
    <svg viewBox="0 0 44 44" className="size-11 shrink-0" role="img" aria-label={`${libre} disponibles de ${alerta.stockMinimo} mínimo`}>
      <circle cx="22" cy="22" r={radio} fill="none" className="stroke-muted" strokeWidth="4.5" />
      <circle
        cx="22"
        cy="22"
        r={radio}
        fill="none"
        className={SEVERIDAD[alerta.severidad].stroke}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeDasharray={`${circunferencia * Math.max(0.035, proporcion)} ${circunferencia}`}
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="22" textAnchor="middle" className="fill-foreground font-mono text-[10px] font-semibold">
        {libre}
      </text>
      <text x="22" y="31" textAnchor="middle" className="fill-muted-foreground font-mono text-[7.5px]">
        / {alerta.stockMinimo}
      </text>
    </svg>
  );
}

function TendenciaConsumo({ semanas }: { semanas: number[] }) {
  const maximo = Math.max(...semanas, 1);
  const puntos = semanas.map((valor, indice) => [2 + indice * 12, 23 - (valor / maximo) * 19] as const);
  const linea = puntos.map(([x, y], indice) => `${indice ? "L" : "M"}${x} ${y.toFixed(1)}`).join(" ");
  const [ultimoX, ultimoY] = puntos[puntos.length - 1];
  const ultimas4 = semanas.slice(-4).reduce((suma, valor) => suma + valor, 0);
  return (
    <div className="hidden flex-col gap-0.5 md:flex">
      <svg viewBox="0 0 90 26" className="h-[26px] w-[88px]" aria-hidden="true">
        <path d={`${linea} L${ultimoX} 25 L2 25 Z`} className="fill-primary/10" />
        <path d={linea} fill="none" className="stroke-primary" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx={ultimoX} cy={ultimoY.toFixed(1)} r="2.4" className="fill-primary" />
      </svg>
      <span className="text-[11px] text-muted-foreground">{ultimas4} uds / 4 sem</span>
    </div>
  );
}

function Chip({ tono, children }: { tono: keyof typeof CHIP; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-px text-[11.5px] font-medium whitespace-nowrap", CHIP[tono])}>{children}</span>;
}

function ChipsAlerta({ alerta }: { alerta: AlertaInventarioRow }) {
  return (
    <>
      {alerta.frenaOrdenes
        ? alerta.ordenes.map((orden) => (
            <Chip key={orden.id} tono="danger">
              Frena {orden.vehiculo} · {formatoPlaca(orden.placa)}
            </Chip>
          ))
        : null}
      {!alerta.frenaOrdenes && alerta.comprometido > 0 ? <Chip tono="info">{alerta.comprometido} en órdenes abiertas</Chip> : null}
      {alerta.disponible > 0 && alerta.diasCobertura !== null && alerta.diasCobertura <= 14 ? (
        <Chip tono="warning">Se agota en ~{alerta.diasCobertura} {alerta.diasCobertura === 1 ? "día" : "días"}</Chip>
      ) : null}
      {alerta.disponible <= 0 && !alerta.frenaOrdenes ? <Chip tono="danger">Sin disponible</Chip> : null}
    </>
  );
}

function FilaAlerta({
  alerta,
  seleccionada,
  cantidad,
  abierta,
  onToggleSeleccion,
  onCantidad,
  onToggleDetalle,
}: {
  alerta: AlertaInventarioRow;
  seleccionada: boolean;
  cantidad: number;
  abierta: boolean;
  onToggleSeleccion: () => void;
  onCantidad: (cantidad: number) => void;
  onToggleDetalle: () => void;
}) {
  const variacion = alerta.ultimaCompra?.variacionPrecioPct ?? null;
  return (
    <div
      className={cn(
        "grid grid-cols-[16px_44px_minmax(0,1fr)_auto_28px] items-center gap-x-3 gap-y-2 border-t px-4 py-3 md:grid-cols-[16px_44px_minmax(0,1fr)_92px_auto_28px]",
        seleccionada && "bg-primary/5",
      )}
    >
      <input
        type="checkbox"
        checked={seleccionada}
        onChange={onToggleSeleccion}
        aria-label={`Seleccionar ${alerta.nombre}`}
        className="size-4 accent-primary"
      />
      <AnilloDisponible alerta={alerta} />
      <div className="min-w-0">
        <p className="text-sm leading-snug font-medium">{alerta.nombre}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono">{alerta.codigo}</span>
          <span>
            stock {alerta.stockActual}
            {alerta.comprometido > 0 ? ` · ${alerta.comprometido} comprometidas` : ""}
          </span>
          <ChipsAlerta alerta={alerta} />
        </div>
      </div>
      <TendenciaConsumo semanas={alerta.consumoSemanal} />
      <div className="flex flex-col items-end gap-0.5">
        <div className="inline-flex items-center overflow-hidden rounded-md border">
          <button
            type="button"
            className="h-6 w-6 bg-muted text-sm hover:bg-muted/70"
            aria-label={`Menos ${alerta.nombre}`}
            onClick={() => onCantidad(Math.max(1, cantidad - 1))}
          >
            −
          </button>
          <output className="min-w-8 text-center font-mono text-xs font-semibold" aria-label={`Cantidad a pedir de ${alerta.nombre}`}>
            {cantidad}
          </output>
          <button
            type="button"
            className="h-6 w-6 bg-muted text-sm hover:bg-muted/70"
            aria-label={`Más ${alerta.nombre}`}
            onClick={() => onCantidad(cantidad + 1)}
          >
            +
          </button>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{formatoMoneda.format(cantidad * alerta.precioCompra)}</span>
      </div>
      <button
        type="button"
        onClick={onToggleDetalle}
        aria-expanded={abierta}
        aria-label={`Detalle de ${alerta.nombre}`}
        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
      >
        <ChevronDown className={cn("size-4 transition-transform", abierta && "rotate-180")} />
      </button>
      {abierta ? (
        <dl className="col-span-full grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg bg-muted/60 p-3 text-xs sm:grid-cols-2 md:col-start-3 lg:grid-cols-4">
          <div>
            <dt className="font-semibold tracking-wide text-muted-foreground uppercase">Última compra</dt>
            <dd className="mt-0.5">
              {alerta.ultimaCompra
                ? `${formatoFecha.format(new Date(alerta.ultimaCompra.fecha))} · ${alerta.ultimaCompra.cantidad} uds · ${alerta.ultimaCompra.proveedorNombre}`
                : "Sin compras registradas"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold tracking-wide text-muted-foreground uppercase">Precio de compra</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono">{formatoMoneda.format(alerta.ultimaCompra?.precioUnitario ?? alerta.precioCompra)}</span>
              {variacion !== null && Math.abs(variacion) >= 0.1 ? (
                <Chip tono={variacion > 0 ? "danger" : "success"}>
                  {variacion > 0 ? "▲" : "▼"} {Math.abs(variacion).toFixed(1)}%
                </Chip>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="font-semibold tracking-wide text-muted-foreground uppercase">Consumo</dt>
            <dd className="mt-0.5">
              {alerta.consumoDiario > 0 ? `${(alerta.consumoDiario * 30).toFixed(1)} uds/mes (últimos 90 días)` : "Sin ventas en 90 días"} · bodega{" "}
              {alerta.bodega.nombre}
            </dd>
          </div>
          <div>
            <dt className="font-semibold tracking-wide text-muted-foreground uppercase">Órdenes que lo usan</dt>
            <dd className="mt-0.5 flex flex-wrap gap-x-2">
              {alerta.ordenes.length === 0
                ? "Ninguna abierta"
                : alerta.ordenes.map((orden) => (
                    <Link key={orden.id} href={`/ordenes/${orden.id}`} className="text-primary hover:underline">
                      {orden.vehiculo} · {formatoPlaca(orden.placa)} ({orden.cantidad})
                    </Link>
                  ))}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

export function AlertasInventarioCard({ data }: { data: AlertasInventario }) {
  const { resumen, alertas } = data;
  const [pestana, setPestana] = useState<Pestana>("proveedor");
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const [cantidades, setCantidades] = useState<Record<string, number>>({});

  const grupos = useMemo(() => agruparPorProveedor(alertas), [alertas]);
  const frenan = useMemo(() => alertas.filter((alerta) => alerta.frenaOrdenes), [alertas]);
  const cantidadDe = (alerta: AlertaInventarioRow) => cantidades[alerta.id] ?? alerta.cantidadSugerida;

  function alternar(conjunto: Set<string>, id: string, set: (valor: Set<string>) => void) {
    const siguiente = new Set(conjunto);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    set(siguiente);
  }

  function alternarGrupo(grupo: GrupoProveedor) {
    const todas = grupo.alertas.every((alerta) => seleccion.has(alerta.id));
    const siguiente = new Set(seleccion);
    for (const alerta of grupo.alertas) {
      if (todas) siguiente.delete(alerta.id);
      else siguiente.add(alerta.id);
    }
    setSeleccion(siguiente);
  }

  const seleccionadas = alertas.filter((alerta) => seleccion.has(alerta.id));
  const totalSeleccion = seleccionadas.reduce((suma, alerta) => suma + cantidadDe(alerta) * alerta.precioCompra, 0);
  const proveedoresSeleccion = new Set(seleccionadas.map((alerta) => alerta.proveedor?.id ?? SIN_PROVEEDOR)).size;

  async function copiarPedido() {
    try {
      await navigator.clipboard.writeText(textoPedido(seleccionadas, cantidades));
      toast.success("Pedido copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el pedido");
    }
  }

  const renderFila = (alerta: AlertaInventarioRow) => (
    <FilaAlerta
      key={alerta.id}
      alerta={alerta}
      seleccionada={seleccion.has(alerta.id)}
      cantidad={cantidadDe(alerta)}
      abierta={abiertas.has(alerta.id)}
      onToggleSeleccion={() => alternar(seleccion, alerta.id, setSeleccion)}
      onCantidad={(cantidad) => setCantidades((actual) => ({ ...actual, [alerta.id]: cantidad }))}
      onToggleDetalle={() => alternar(abiertas, alerta.id, setAbiertas)}
    />
  );

  const listaPlana = pestana === "urgencia" ? alertas : frenan;
  const ocultas =
    pestana === "proveedor"
      ? grupos.reduce((suma, grupo) => suma + Math.max(0, grupo.alertas.length - LIMITE_POR_PROVEEDOR), 0)
      : Math.max(0, listaPlana.length - LIMITE_URGENCIA);

  const pestanas: { id: Pestana; label: string; count: number }[] = [
    { id: "proveedor", label: "Por proveedor", count: grupos.length },
    { id: "urgencia", label: "Por urgencia", count: alertas.length },
    { id: "ordenes", label: "Frenan órdenes", count: frenan.length },
  ];

  return (
    <Card id="alertas-inventario" className="scroll-mt-16 gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 py-4">
        <CardTitle className="flex items-center gap-2">
          Alertas de inventario
          {resumen.total > 0 ? (
            <span className="rounded-full bg-red-50 px-2 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
              {resumen.total}
            </span>
          ) : null}
        </CardTitle>
        <Link href="/repuestos" className="text-sm text-primary hover:underline">
          Ver repuestos →
        </Link>
      </CardHeader>

      {resumen.total === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t px-4 py-10 text-center">
          <PackageCheck className="size-8 text-green-600 dark:text-green-400" />
          <p className="text-sm font-medium">Todo en orden</p>
          <p className="text-sm text-muted-foreground">Ningún repuesto de esta sede está por debajo de su mínimo disponible.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border-y bg-border lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div className="col-span-2 flex flex-col gap-1.5 bg-card px-4 py-3 lg:col-span-1">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Estado</span>
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${resumen.sinDisponible} sin disponible, ${resumen.criticos} críticos, ${resumen.bajoMinimo} bajo mínimo`}>
                {resumen.sinDisponible > 0 ? <i className="bg-red-500" style={{ flex: resumen.sinDisponible }} /> : null}
                {resumen.criticos > 0 ? <i className="bg-amber-500" style={{ flex: resumen.criticos }} /> : null}
                {resumen.bajoMinimo > 0 ? <i className="bg-yellow-400" style={{ flex: resumen.bajoMinimo }} /> : null}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {(
                  [
                    ["SIN_DISPONIBLE", resumen.sinDisponible],
                    ["CRITICO", resumen.criticos],
                    ["BAJO_MINIMO", resumen.bajoMinimo],
                  ] as const
                ).map(([severidad, valor]) => (
                  <span key={severidad} className="inline-flex items-center gap-1.5">
                    <i className={cn("size-2 rounded-full", SEVERIDAD[severidad].dot)} />
                    <b className="font-semibold text-foreground">{valor}</b> {SEVERIDAD[severidad].label}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-0.5 bg-card px-4 py-3">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Órdenes frenadas</span>
              <span className={cn("font-mono text-xl font-semibold", resumen.ordenesFrenadas.length > 0 && "text-red-600 dark:text-red-400")}>
                {resumen.ordenesFrenadas.length}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {resumen.ordenesFrenadas.length > 0 ? resumen.ordenesFrenadas.map((orden) => orden.vehiculo).join(" · ") : "Ninguna esperando repuestos"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 bg-card px-4 py-3">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Se agotan en 7 días</span>
              <span className="font-mono text-xl font-semibold">{resumen.seAgotanEn7Dias}</span>
              <span className="text-xs text-muted-foreground">según consumo de 90 días</span>
            </div>
            <div className="flex flex-col gap-0.5 bg-card px-4 py-3">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Costo de reposición</span>
              <span className="font-mono text-xl font-semibold">{formatoMoneda.format(resumen.costoReposicion)}</span>
              <span className="text-xs text-muted-foreground">con las cantidades sugeridas</span>
            </div>
          </div>

          <div role="tablist" aria-label="Agrupar alertas" className="flex gap-1 overflow-x-auto border-b px-3 pt-2">
            {pestanas.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={pestana === tab.id}
                onClick={() => setPestana(tab.id)}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2 text-sm whitespace-nowrap text-muted-foreground",
                  pestana === tab.id && "border-primary font-medium text-foreground",
                )}
              >
                {tab.label}
                <span className="rounded-full bg-muted px-1.5 text-[11px]">{tab.count}</span>
              </button>
            ))}
          </div>

          <div role="tabpanel">
            {pestana === "proveedor" ? (
              grupos.map((grupo, indice) => {
                const total = grupo.alertas.reduce((suma, alerta) => suma + cantidadDe(alerta) * alerta.precioCompra, 0);
                const todas = grupo.alertas.every((alerta) => seleccion.has(alerta.id));
                return (
                  <div key={grupo.key}>
                    <div className={cn("flex flex-wrap items-center justify-between gap-2 bg-muted/60 px-4 py-2.5 text-xs", indice > 0 && "border-t")}>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted-foreground">
                        <b className="text-sm font-semibold text-foreground">{grupo.nombre}</b>
                        <span>
                          {grupo.alertas.length} {grupo.alertas.length === 1 ? "repuesto" : "repuestos"}
                        </span>
                        <span className="font-mono">{formatoMoneda.format(total)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button type="button" variant="outline" size="sm" onClick={() => alternarGrupo(grupo)}>
                          {todas ? "Quitar todos" : "Seleccionar todos"}
                        </Button>
                        <Link href={hrefNuevaEntrada(grupo)} className={buttonVariants({ size: "sm" })}>
                          <PackagePlus />
                          Registrar entrada
                        </Link>
                      </div>
                    </div>
                    {(mostrarTodas ? grupo.alertas : grupo.alertas.slice(0, LIMITE_POR_PROVEEDOR)).map(renderFila)}
                  </div>
                );
              })
            ) : listaPlana.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Ninguna orden abierta está esperando repuestos.</p>
            ) : (
              (mostrarTodas ? listaPlana : listaPlana.slice(0, LIMITE_URGENCIA)).map(renderFila)
            )}
          </div>

          {ocultas > 0 || mostrarTodas ? (
            <div className="border-t px-4 py-2 text-center">
              <Button type="button" variant="ghost" size="sm" onClick={() => setMostrarTodas((actual) => !actual)}>
                {mostrarTodas ? "Mostrar menos" : `Mostrar ${ocultas} más`}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-card px-4 py-3 text-sm">
            {seleccionadas.length > 0 ? (
              <>
                <span>
                  <b className="font-semibold">{seleccionadas.length}</b> {seleccionadas.length === 1 ? "repuesto" : "repuestos"} ·{" "}
                  <b className="font-mono font-semibold">{formatoMoneda.format(totalSeleccion)}</b> · {proveedoresSeleccion}{" "}
                  {proveedoresSeleccion === 1 ? "proveedor" : "proveedores"}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => setSeleccion(new Set())}>
                    Limpiar
                  </Button>
                  <Button type="button" size="sm" onClick={copiarPedido}>
                    <ClipboardCopy />
                    Copiar pedido
                  </Button>
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Selecciona repuestos para armar un pedido y copiarlo para el proveedor.</span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
