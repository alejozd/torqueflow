"use client";

import { useEffect, useState, useTransition } from "react";
import { Banknote, HandCoins, Receipt, ShoppingBag, Undo2 } from "lucide-react";
import {
  listarVentasMostradorAction,
  obtenerVentaMostradorAction,
  type ResumenVentasHoy,
  type VentaMostradorFila,
} from "@/app/actions/venta-mostrador-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import {
  ETIQUETA_ESTADO_VENTA,
  quedaPorDevolver,
  rangoDelFiltro,
  resumirProductos,
  type EstadoVentaMostrador,
  type FiltroVentas,
} from "@/lib/mostrador/listado-ventas";
import { cn } from "@/lib/utils";
import { usePestanaMostrador, type AccionVenta } from "../pestanas-mostrador";
import { urlComprobante } from "../venta-cobrada";
import { SheetVenta } from "./sheet-venta";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const pesos = (valor: number) => formatoMoneda.format(valor);
const formatoHora = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
const formatoDiaHora = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

const FILTROS: { id: FiltroVentas; etiqueta: string }[] = [
  { id: "hoy", etiqueta: "Hoy" },
  { id: "ayer", etiqueta: "Ayer" },
  { id: "30dias", etiqueta: "Últimos 30 días" },
];

const ESTILO_ESTADO: Record<EstadoVentaMostrador, string> = {
  PAGADA: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  A_CREDITO: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  DEVUELTA_PARCIAL: "border-blue-500/40 text-blue-700 dark:text-blue-400",
  DEVUELTA: "border-border text-muted-foreground",
};

function coincide(venta: VentaMostradorFila, texto: string): boolean {
  const q = texto.trim().toLowerCase().replace(/^#/, "");
  if (q === "") return true;
  return [String(venta.numero), venta.clienteNombre ?? "consumidor final", ...venta.items.map((item) => item.descripcion)]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

/**
 * Pestaña "Ventas" del mostrador (spec §5): KPI del día en una fila, filtro
 * Hoy / Ayer / Últimos 30 días, búsqueda por número, cliente o producto, y por
 * fila Ver, Cobrar saldo y Devolver en un panel lateral, más Imprimir.
 * "Hoy" usa lo que manda el servidor (se refresca solo tras cobrar o devolver);
 * los otros filtros se piden con `listarVentasMostradorAction`.
 */
export function PanelVentas({
  ventasHoy,
  resumen,
  ventaEnlazada,
}: {
  ventasHoy: VentaMostradorFila[];
  resumen: ResumenVentasHoy;
  /** La del enlace `?venta=` cuando no es de hoy (Cartera → Cobrar). */
  ventaEnlazada: VentaMostradorFila | null;
}) {
  const { solicitud } = usePestanaMostrador();
  const [filtro, setFiltro] = useState<FiltroVentas>("hoy");
  const [otras, setOtras] = useState<{ filtro: FiltroVentas; ventas: VentaMostradorFila[]; error: string | null } | null>(null);
  const [cargando, startCarga] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [abierta, setAbierta] = useState<{ ventaId: string; accion: AccionVenta } | null>(null);
  const [atendida, setAtendida] = useState<number | null>(null);
  /** Ventas pedidas por id que no están en ninguna lista cargada. */
  const [sueltas, setSueltas] = useState<VentaMostradorFila[]>([]);
  /** Ids pedidos que el servidor no encontró (otra sede o no existe). */
  const [perdidas, setPerdidas] = useState<string[]>([]);

  // Un pedido de abrir una venta (desde la tarjeta de venta cobrada o el enlace de
  // Cartera) abre su panel una sola vez: se ajusta durante el render, sin efecto.
  if (solicitud && solicitud.clave !== atendida) {
    setAtendida(solicitud.clave);
    setAbierta({ ventaId: solicitud.ventaId, accion: solicitud.accion });
  }

  function cargar(nuevo: FiltroVentas) {
    if (nuevo === "hoy") return;
    startCarga(async () => {
      const resultado = await listarVentasMostradorAction(rangoDelFiltro(nuevo, new Date()));
      setOtras({ filtro: nuevo, ...resultado });
    });
  }

  function elegirFiltro(nuevo: FiltroVentas) {
    setFiltro(nuevo);
    cargar(nuevo);
  }

  const filas = filtro === "hoy" ? ventasHoy : otras?.filtro === filtro ? otras.ventas : [];
  const errorListado = filtro !== "hoy" && otras?.filtro === filtro ? otras.error : null;
  const visibles = filas.filter((venta) => coincide(venta, busqueda));

  const buscarPorId = (id: string) =>
    ventasHoy.find((venta) => venta.id === id) ??
    filas.find((venta) => venta.id === id) ??
    (ventaEnlazada?.id === id ? ventaEnlazada : undefined) ??
    sueltas.find((venta) => venta.id === id);
  const ventaAbierta = abierta ? buscarPorId(abierta.ventaId) : undefined;
  const faltaVentaAbierta = abierta !== null && ventaAbierta === undefined && !perdidas.includes(abierta.ventaId);
  const idFaltante = faltaVentaAbierta ? abierta.ventaId : null;

  // La venta pedida no está en ninguna lista (p. ej. recién cobrada antes del
  // refresco): se trae sola.
  useEffect(() => {
    if (!idFaltante) return;
    let vigente = true;
    obtenerVentaMostradorAction(idFaltante).then((venta) => {
      if (!vigente) return;
      if (venta) setSueltas((actuales) => [...actuales.filter((v) => v.id !== venta.id), venta]);
      else setPerdidas((actuales) => [...actuales, idFaltante]);
    });
    return () => {
      vigente = false;
    };
  }, [idFaltante]);

  function cerrar() {
    setAbierta(null);
    // Lo cobrado o devuelto cambia la fila: "Hoy" se refresca solo; los otros filtros se piden de nuevo.
    cargar(filtro);
  }

  const columnas: DataTableColumn<VentaMostradorFila>[] = [
    { header: "Nº", cell: (venta) => <span className="font-mono">#{venta.numero}</span> },
    {
      header: "Hora",
      cell: (venta) => (
        <span className="whitespace-nowrap">
          {filtro === "hoy" ? formatoHora.format(venta.createdAt) : formatoDiaHora.format(venta.createdAt)}
        </span>
      ),
    },
    { header: "Cliente", cell: (venta) => venta.clienteNombre ?? "Consumidor final" },
    {
      header: "Productos",
      cell: (venta) => (
        <span className="block max-w-56 truncate" title={venta.items.map((item) => `${item.descripcion} ×${item.cantidad}`).join(", ")}>
          {resumirProductos(venta.items)}
        </span>
      ),
    },
    { header: "Métodos", cell: (venta) => <span className="whitespace-nowrap">{venta.metodos}</span> },
    { header: "Total", className: "text-right", cell: (venta) => <span className="font-mono">{pesos(venta.total)}</span> },
    {
      header: "Saldo",
      className: "text-right",
      cell: (venta) => (
        <span className={cn("font-mono", venta.saldoPendiente > 0 && "font-medium text-amber-600")}>
          {pesos(venta.saldoPendiente)}
        </span>
      ),
    },
    {
      header: "Estado",
      cell: (venta) => (
        <Badge variant="outline" className={ESTILO_ESTADO[venta.estado]}>
          {ETIQUETA_ESTADO_VENTA[venta.estado]}
        </Badge>
      ),
    },
    {
      header: <span className="sr-only">Acciones</span>,
      cell: (venta) => (
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Ver venta #${venta.numero}`}
            onClick={() => setAbierta({ ventaId: venta.id, accion: "ver" })}
          >
            Ver
          </Button>
          {venta.saldoPendiente > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Cobrar saldo de la venta #${venta.numero}`}
              onClick={() => setAbierta({ ventaId: venta.id, accion: "cobrar" })}
            >
              Cobrar saldo
            </Button>
          ) : null}
          {quedaPorDevolver(venta.items) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Devolver de la venta #${venta.numero}`}
              disabled={!venta.devolucion.permitido}
              title={venta.devolucion.motivo ?? undefined}
              onClick={() => setAbierta({ ventaId: venta.id, accion: "devolver" })}
            >
              Devolver
            </Button>
          ) : null}
          <a
            href={urlComprobante({ ventaId: venta.id }, true)}
            target="_blank"
            rel="noopener"
            aria-label={`Imprimir comprobante de la venta #${venta.numero}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Imprimir
          </a>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          title="Vendido hoy"
          value={pesos(resumen.vendido)}
          icon={<Receipt className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
        />
        <KpiCard
          title="Nº ventas"
          value={resumen.numeroVentas}
          icon={<ShoppingBag className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />
        <KpiCard
          title="Efectivo por mostrador"
          value={pesos(resumen.efectivo)}
          subtitle="Cobrado hoy menos lo devuelto en efectivo"
          icon={<Banknote className={cn("size-5", KPI_TONE.neutral.icon)} />}
          iconBgColor={KPI_TONE.neutral.iconBg}
          className={KPI_TONE.neutral.cardBg}
        />
        <KpiCard
          title="Por cobrar"
          value={pesos(resumen.porCobrar)}
          subtitle={
            resumen.ventasPorCobrar === 1 ? "1 venta a crédito" : `${resumen.ventasPorCobrar} ventas a crédito`
          }
          icon={<HandCoins className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />
        <KpiCard
          title="Devuelto hoy"
          value={pesos(resumen.devuelto)}
          icon={<Undo2 className={cn("size-5", KPI_TONE.danger.icon)} />}
          iconBgColor={KPI_TONE.danger.iconBg}
          className={KPI_TONE.danger.cardBg}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Fecha de las ventas" className="flex gap-1 rounded-lg border border-border bg-muted p-1">
          {FILTROS.map((opcion) => (
            <button
              key={opcion.id}
              type="button"
              aria-pressed={filtro === opcion.id}
              onClick={() => elegirFiltro(opcion.id)}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
                filtro === opcion.id ? "bg-card shadow-sm ring-1 ring-border" : "hover:bg-card/70",
              )}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
        <Input
          type="search"
          aria-label="Buscar ventas"
          placeholder="Buscar por número, cliente o producto"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          className="w-full sm:w-80"
        />
        {cargando ? (
          <span role="status" className="text-sm text-muted-foreground">
            Cargando ventas...
          </span>
        ) : null}
      </div>

      {errorListado ? (
        <Alert variant="destructive">
          <AlertDescription>{errorListado}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        columns={columnas}
        rows={visibles}
        getRowKey={(venta) => venta.id}
        emptyMessage={
          busqueda.trim() !== ""
            ? "Ninguna venta coincide con la búsqueda."
            : filtro === "hoy"
              ? "Todavía no hay ventas de mostrador hoy."
              : "No hay ventas de mostrador en esas fechas."
        }
      />

      <SheetVenta
        abierta={abierta}
        venta={ventaAbierta ?? null}
        cargando={faltaVentaAbierta}
        onCambiarAccion={(accion) => setAbierta((actual) => (actual ? { ...actual, accion } : actual))}
        onCerrar={cerrar}
      />
    </div>
  );
}
