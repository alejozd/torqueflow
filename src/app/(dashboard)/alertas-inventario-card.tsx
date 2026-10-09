"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, BellRing, ChevronDown, ClipboardCopy, ClipboardList, Truck, DollarSign, Hourglass, PackageCheck, PackagePlus, PackageX, Wrench } from "lucide-react";
import { toast } from "sonner";
import { posponerAlertaInventarioAction, reactivarAlertaInventarioAction } from "@/app/actions/alertas-inventario-actions";
import { crearPedidosCompraAction } from "@/app/actions/pedido-compra-actions";
import {
  DIAS_POSPONER_ALERTA,
  type AlertaInventarioRow,
  type AlertasInventario,
  type OrdenFrenada,
  type SeveridadAlerta,
} from "@/lib/dashboard/alertas-inventario";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { formatoPlaca } from "@/lib/placa";
import { cn } from "@/lib/utils";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoFecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });
const formatoFechaCorta = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });

const SEVERIDAD: Record<SeveridadAlerta, { label: string; dot: string; stroke: string }> = {
  SIN_DISPONIBLE: { label: "sin disponible", dot: "bg-red-500", stroke: "stroke-red-500" },
  CRITICO: { label: "críticos", dot: "bg-amber-500", stroke: "stroke-amber-500" },
  BAJO_MINIMO: { label: "bajo mínimo", dot: "bg-yellow-400", stroke: "stroke-yellow-400" },
};

const CHIP = {
  danger: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  success: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  neutral: "bg-muted text-muted-foreground",
} as const;

type Pestana = "proveedor" | "urgencia" | "ordenes" | "pospuestas" | "en-camino";

/** Rows shown per list (urgencia/ordenes) or per proveedor group before "Mostrar todas". */
const LIMITE_URGENCIA = 8;
const LIMITE_POR_PROVEEDOR = 4;
const SIN_PROVEEDOR = "sin-proveedor";

interface GrupoProveedor {
  key: string;
  nombre: string;
  proveedorId: string | null;
  diasEntrega: number | null;
  alertas: AlertaInventarioRow[];
}

function agruparPorProveedor(alertas: AlertaInventarioRow[]): GrupoProveedor[] {
  const grupos = new Map<string, GrupoProveedor>();
  for (const alerta of alertas) {
    const key = alerta.proveedor?.id ?? SIN_PROVEEDOR;
    const grupo = grupos.get(key);
    if (grupo) grupo.alertas.push(alerta);
    else grupos.set(key, {
        key,
        nombre: alerta.proveedor?.nombre ?? "Sin proveedor asignado",
        proveedorId: alerta.proveedor?.id ?? null,
        diasEntrega: alerta.proveedor?.diasEntrega ?? null,
        alertas: [alerta],
      });
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

/** "Mazda 3 XYZ-789 y 2 más": KPI subtitles are one short line. */
function resumenOrdenesFrenadas(ordenes: OrdenFrenada[]): string {
  if (ordenes.length === 0) return "Ninguna esperando repuestos";
  const [primera] = ordenes;
  const texto = `${primera.vehiculo} ${formatoPlaca(primera.placa)}`;
  return ordenes.length > 1 ? `${texto} y ${ordenes.length - 1} más` : texto;
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
  if (semanas.every((valor) => valor === 0)) {
    return <span className="hidden text-[11px] whitespace-nowrap text-muted-foreground md:block">Sin consumo</span>;
  }
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
      {alerta.seAgotaAntesDeEntrega ? (
        <Chip tono="danger">
          Se agota en ~{alerta.diasCobertura} {alerta.diasCobertura === 1 ? "día" : "días"}, antes de la entrega
        </Chip>
      ) : alerta.disponible > 0 && alerta.diasCobertura !== null && alerta.diasCobertura <= 14 ? (
        <Chip tono="warning">Se agota en ~{alerta.diasCobertura} {alerta.diasCobertura === 1 ? "día" : "días"}</Chip>
      ) : null}
      {alerta.disponible <= 0 && !alerta.frenaOrdenes ? <Chip tono="danger">Sin disponible</Chip> : null}
      {alerta.enCamino ? (
        <Chip tono="success">
          En camino {alerta.enCamino.cantidad} uds
          {alerta.enCamino.pedidos[0]?.fechaEsperada
            ? ` · llega el ${formatoFechaCorta.format(new Date(alerta.enCamino.pedidos[0].fechaEsperada))}`
            : ""}
        </Chip>
      ) : null}
      {alerta.pospuestaHasta ? <Chip tono="neutral">Pospuesta hasta el {formatoFechaCorta.format(new Date(alerta.pospuestaHasta))}</Chip> : null}
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
  onCambiarPospuesta,
  cambiandoPospuesta,
}: {
  alerta: AlertaInventarioRow;
  seleccionada: boolean;
  cantidad: number;
  abierta: boolean;
  onToggleSeleccion: () => void;
  onCantidad: (cantidad: number) => void;
  onToggleDetalle: () => void;
  onCambiarPospuesta: () => void;
  cambiandoPospuesta: boolean;
}) {
  const variacion = alerta.ultimaCompra?.variacionPrecioPct ?? null;
  return (
    <div
      className={cn(
        "grid grid-cols-[16px_44px_minmax(0,1fr)_28px] items-center gap-x-3 gap-y-2 border-t px-4 py-3 md:grid-cols-[16px_44px_minmax(0,1fr)_92px_auto_28px]",
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
      <div className="col-start-3 row-start-2 flex items-center gap-2 md:col-start-auto md:row-start-auto md:flex-col md:items-end md:gap-0.5">
        <div className="inline-flex items-center overflow-hidden rounded-md border">
          <button
            type="button"
            className="h-6 w-6 bg-muted text-sm hover:bg-muted/70"
            aria-label={`Menos ${alerta.nombre}`}
            onClick={() => onCantidad(Math.max(0, cantidad - alerta.multiploCompra))}
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
            onClick={() => onCantidad(cantidad + alerta.multiploCompra)}
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
        className="col-start-4 row-start-1 grid size-7 place-items-center md:col-start-auto md:row-start-auto rounded-md text-muted-foreground hover:bg-muted"
      >
        <ChevronDown className={cn("size-4 transition-transform", abierta && "rotate-180")} />
      </button>
      {abierta ? (
        <dl className="col-span-full grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg bg-muted/60 p-3 text-xs sm:grid-cols-2 md:col-start-3 lg:grid-cols-3">
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
              {alerta.consumoDiario > 0 ? `${(alerta.consumoDiario * 30).toFixed(1)} uds/mes (últimos 90 días)` : "Sin ventas en 90 días"} · {alerta.bodega.nombre}
            </dd>
          </div>
          <div>
            <dt className="font-semibold tracking-wide text-muted-foreground uppercase">Reposición</dt>
            <dd className="mt-0.5">
              Hasta {alerta.objetivoReposicion} uds
              {alerta.multiploCompra > 1 ? ` · empaque de ${alerta.multiploCompra}` : ""} · entrega en {alerta.diasEntrega}{" "}
              {alerta.diasEntrega === 1 ? "día" : "días"}
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
          <div className="flex items-end">
            <Button type="button" variant="outline" size="sm" disabled={cambiandoPospuesta} onClick={onCambiarPospuesta}>
              {alerta.pospuestaHasta ? <BellRing /> : <BellOff />}
              {alerta.pospuestaHasta ? "Reactivar alerta" : `Posponer ${DIAS_POSPONER_ALERTA} días`}
            </Button>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

export function AlertasInventarioCard({ data }: { data: AlertasInventario }) {
  const { resumen, alertas } = data;
  const activas = useMemo(() => alertas.filter((alerta) => !alerta.pospuestaHasta), [alertas]);
  const pospuestas = useMemo(() => alertas.filter((alerta) => alerta.pospuestaHasta), [alertas]);
  // Grouping by proveedor only helps once repuestos have one assigned.
  const [pestanaElegida, setPestana] = useState<Pestana>(() => (alertas.some((alerta) => alerta.proveedor) ? "proveedor" : "urgencia"));
  // Reactivating the last pospuesta removes its tab: fall back to "Por urgencia".
  const pestana: Pestana = pestanaElegida === "pospuestas" && pospuestas.length === 0 ? "urgencia" : pestanaElegida;
  const [cambiandoPospuesta, startCambioPospuesta] = useTransition();
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const [cantidades, setCantidades] = useState<Record<string, number>>({});

  const grupos = useMemo(() => agruparPorProveedor(activas), [activas]);
  const frenan = useMemo(() => activas.filter((alerta) => alerta.frenaOrdenes), [activas]);

  function cambiarPospuesta(alerta: AlertaInventarioRow) {
    startCambioPospuesta(async () => {
      const resultado = alerta.pospuestaHasta
        ? await reactivarAlertaInventarioAction(alerta.id)
        : await posponerAlertaInventarioAction(alerta.id);
      if (resultado.error) toast.error(resultado.error);
      else toast.success(alerta.pospuestaHasta ? `Alerta de ${alerta.nombre} reactivada` : `Alerta de ${alerta.nombre} pospuesta ${DIAS_POSPONER_ALERTA} días`);
    });
  }
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
  const proveedoresSeleccion = new Set(seleccionadas.flatMap((alerta) => (alerta.proveedor ? [alerta.proveedor.id] : []))).size;

  const router = useRouter();
  const [creandoPedidos, startCrearPedidos] = useTransition();

  function crearPedidos() {
    const lineas = seleccionadas
      .map((alerta) => ({ repuestoId: alerta.id, cantidad: cantidadDe(alerta) }))
      .filter((linea) => linea.cantidad > 0);
    if (lineas.length === 0) {
      toast.error("Las cantidades seleccionadas están en 0.");
      return;
    }
    startCrearPedidos(async () => {
      const resultado = await crearPedidosCompraAction(lineas);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      const creados = resultado.pedidoIds.length;
      toast.success(creados === 1 ? "Pedido creado: revísalo y envíalo al proveedor" : `${creados} pedidos creados, uno por proveedor`);
      setSeleccion(new Set());
      router.push(creados === 1 ? `/pedidos-compra/${resultado.pedidoIds[0]}` : "/pedidos-compra?estado=BORRADOR");
    });
  }

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
      onCambiarPospuesta={() => cambiarPospuesta(alerta)}
      cambiandoPospuesta={cambiandoPospuesta}
    />
  );

  const listaPlana = pestana === "urgencia" ? activas : pestana === "pospuestas" ? pospuestas : frenan;
  const mensajeVacio =
    pestana === "ordenes"
      ? "Ninguna orden abierta está esperando repuestos."
      : pestana === "pospuestas"
        ? "No hay alertas pospuestas."
        : "Todas las alertas están pospuestas.";
  const ocultas = pestana === "en-camino" ? 0 :
    pestana === "proveedor"
      ? grupos.reduce((suma, grupo) => suma + Math.max(0, grupo.alertas.length - LIMITE_POR_PROVEEDOR), 0)
      : Math.max(0, listaPlana.length - LIMITE_URGENCIA);

  const pestanas: { id: Pestana; label: string; count: number }[] = [
    { id: "proveedor", label: "Por proveedor", count: grupos.length },
    { id: "urgencia", label: "Por urgencia", count: activas.length },
    { id: "ordenes", label: "Frenan órdenes", count: frenan.length },
    ...(resumen.pedidosEnCamino.length > 0
      ? [{ id: "en-camino" as const, label: "En camino", count: resumen.pedidosEnCamino.length }]
      : []),
    ...(pospuestas.length > 0 ? [{ id: "pospuestas" as const, label: "Pospuestas", count: pospuestas.length }] : []),
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
          <div className="flex flex-col gap-3 px-4 pb-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="Sin disponible"
                value={resumen.sinDisponible}
                valueColor={resumen.sinDisponible > 0 ? "danger" : "default"}
                subtitle={`${resumen.criticos} críticos · ${resumen.bajoMinimo} bajo mínimo`}
                icon={<PackageX className={cn("size-5", KPI_TONE.danger.icon)} />}
                iconBgColor={KPI_TONE.danger.iconBg}
                className={KPI_TONE.danger.cardBg}
              />
              <KpiCard
                title="Órdenes frenadas"
                value={resumen.ordenesFrenadas.length}
                valueColor={resumen.ordenesFrenadas.length > 0 ? "danger" : "default"}
                subtitle={resumenOrdenesFrenadas(resumen.ordenesFrenadas)}
                subtitleColor={resumen.ordenesFrenadas.length > 0 ? "danger" : "default"}
                highlight={resumen.ordenesFrenadas.length > 0}
                icon={<Wrench className={cn("size-5", KPI_TONE.warning.icon)} />}
                iconBgColor={KPI_TONE.warning.iconBg}
                className={KPI_TONE.warning.cardBg}
              />
              <KpiCard
                title="Se agotan en 7 días"
                value={resumen.seAgotanEn7Dias}
                subtitle="Según consumo de 90 días"
                icon={<Hourglass className={cn("size-5", KPI_TONE.purple.icon)} />}
                iconBgColor={KPI_TONE.purple.iconBg}
                className={KPI_TONE.purple.cardBg}
              />
              <KpiCard
                title="Costo de reposición"
                value={formatoMoneda.format(resumen.costoReposicion)}
                valueColor="success"
                subtitle={
                  resumen.pedidosEnCamino.length > 0
                    ? `Descontando ${resumen.pedidosEnCamino.length} ${resumen.pedidosEnCamino.length === 1 ? "pedido" : "pedidos"} en camino`
                    : "Con las cantidades sugeridas"
                }
                icon={<DollarSign className={cn("size-5", KPI_TONE.success.icon)} />}
                iconBgColor={KPI_TONE.success.iconBg}
                className={KPI_TONE.success.cardBg}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div
                className="flex h-2 gap-0.5 overflow-hidden rounded-full"
                role="img"
                aria-label={`${resumen.sinDisponible} sin disponible, ${resumen.criticos} críticos, ${resumen.bajoMinimo} bajo mínimo`}
              >
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
          </div>

          <div role="tablist" aria-label="Agrupar alertas" className="flex gap-1 overflow-x-auto overflow-y-hidden border-y px-3 pt-2">
            {pestanas.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={pestana === tab.id}
                onClick={() => setPestana(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2 text-sm whitespace-nowrap text-muted-foreground",
                  pestana === tab.id && "border-primary font-medium text-foreground",
                )}
              >
                {tab.label}
                <span className="rounded-full bg-muted px-1.5 text-[11px]">{tab.count}</span>
              </button>
            ))}
          </div>

          <div role="tabpanel">
            {pestana === "en-camino" ? (
              resumen.pedidosEnCamino.map((pedido) => (
                <Link
                  key={pedido.id}
                  href={`/pedidos-compra/${pedido.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-3 text-sm first:border-t-0 hover:bg-muted/50"
                >
                  <Truck className="size-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-mono font-medium">#{pedido.numero}</span>
                  <span className="font-medium">{pedido.proveedorNombre}</span>
                  <span className="text-muted-foreground">
                    {pedido.referencias} {pedido.referencias === 1 ? "referencia" : "referencias"}
                  </span>
                  <span className="text-muted-foreground">
                    {pedido.fechaEsperada ? `llega el ${formatoFechaCorta.format(new Date(pedido.fechaEsperada))}` : "sin fecha"}
                  </span>
                  <span className="ml-auto font-mono">{formatoMoneda.format(pedido.total)}</span>
                </Link>
              ))
            ) : pestana === "proveedor" && grupos.length > 0 ? (
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
                        {grupo.diasEntrega !== null ? (
                          <span>
                            entrega en {grupo.diasEntrega} {grupo.diasEntrega === 1 ? "día" : "días"}
                          </span>
                        ) : null}
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
            ) : pestana === "proveedor" || listaPlana.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">{mensajeVacio}</p>
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
                  <b className="font-mono font-semibold">{formatoMoneda.format(totalSeleccion)}</b>
                  {proveedoresSeleccion > 0 ? ` · ${proveedoresSeleccion} ${proveedoresSeleccion === 1 ? "proveedor" : "proveedores"}` : ""}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => setSeleccion(new Set())}>
                    Limpiar
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={copiarPedido}>
                    <ClipboardCopy />
                    Copiar
                  </Button>
                  <Button type="button" size="sm" disabled={creandoPedidos} onClick={crearPedidos}>
                    <ClipboardList />
                    {creandoPedidos ? "Creando..." : proveedoresSeleccion > 1 ? "Crear pedidos" : "Crear pedido"}
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
