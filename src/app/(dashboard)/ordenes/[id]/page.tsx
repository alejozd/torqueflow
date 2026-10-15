import Link from "next/link";
import { NavSecciones } from "@/components/nav-secciones";
import { seccionesAbiertas } from "@/lib/orden/secciones";
import { SeccionOrden } from "./seccion-orden";
import { notFound } from "next/navigation";
import { getOrden, listTecnicos } from "@/app/actions/orden-actions";
import { requireSession } from "@/lib/auth/guards";
import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { listDviChecklistItems } from "@/app/actions/dvi-checklist-item-actions";
import { listAnticiposDeOrden } from "@/app/actions/anticipo-actions";
import { listServicios } from "@/app/actions/servicio-actions";
import { getOpcionesTaller } from "@/app/actions/configuracion-taller-actions";
import { AnticiposSection } from "./anticipos-section";
import { AvanceFase } from "./avance-fase";
import { BannerSintomas, CabeceraOrden } from "./cabecera-orden";
import { CicloOrden } from "./ciclo-orden";
import { CuentaOrden } from "./cuenta-orden";
import { MecanicoMenu } from "./mecanico-menu";
import { PrioridadBloque } from "../prioridad-bloque";
import { PRIORIDAD_COLOR } from "../prioridad-tono";
import { ESTADO_DOT_COLOR } from "../estado-tono";
import { DiagramaDanios } from "./diagrama-danios";
import { GarantiasSection } from "./garantias-section";
import { RecepcionForm } from "./recepcion-form";
import { ActaEntregaForm } from "./acta-entrega-form";
import { AgregarItemForm } from "./agregar-item-form";
import { AplicarServicioForm } from "./aplicar-servicio-form";
import { AgregarManoObraForm } from "./agregar-mano-obra-form";
import { DviChecklistForm } from "./dvi-checklist-form";
import { DviFotoForm } from "./dvi-foto-form";
import { esOrdenMutable } from "@/lib/orden/mutable-guard";
import { QuitarConConfirmacion } from "@/components/quitar-con-confirmacion";
import { deleteItemOrdenFormAction } from "@/app/actions/item-orden-actions";
import { deleteManoDeObraFormAction } from "@/app/actions/mano-de-obra-actions";
import type { ResultadoAccion } from "@/lib/resultado-accion";
import type { DviChecklist } from "@/lib/dvi/checklist-items";
import { totalOrden } from "@/lib/dashboard/calculos";
import { cn } from "@/lib/utils";
import { FormGroup } from "@/components/form-group";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Anchor nav for the sections stacked in the left column (same idea as the
// Inicio dashboard's own pill nav) -- the right column is its own sticky
// sidebar already, so it doesn't need an anchor.
const SECCIONES_ORDEN = [
  { id: "recepcion", label: "Recepción", dot: "bg-orange-500" },
  { id: "items", label: "Ítems", dot: "bg-amber-500" },
  { id: "mano-obra", label: "Mano de obra", dot: "bg-purple-500" },
  { id: "dvi", label: "DVI", dot: "bg-red-500" },
  { id: "entrega", label: "Acta y garantías", dot: "bg-teal-500" },
  { id: "anticipos", label: "Anticipos", dot: "bg-green-500" },
] as const;

type Orden = NonNullable<Awaited<ReturnType<typeof getOrden>>>;
type ItemRow = Orden["items"][number];
type ManoObraRow = Orden["manoDeObra"][number];

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const ITEMS_COLUMNS: DataTableColumn<ItemRow>[] = [
  {
    header: "Concepto",
    cell: (item) => <span className="text-sm">{item.descripcion}</span>,
  },
  {
    header: "Tipo",
    cell: (item) => (
      <Badge
        variant="outline"
        className={cn(
          "gap-1.5",
          item.repuestoId
            ? "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[10px] text-[oklch(0.55_0.15_60)]"
            : "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[10px] text-[oklch(0.44_0.12_250)]"
        )}
      >
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: item.repuestoId ? "oklch(0.55 0.15 60)" : "oklch(0.44 0.12 250)" }}
        />
        {item.repuestoId ? "Repuesto" : "Manual"}
      </Badge>
    ),
  },
  {
    header: "Cant.",
    className: "text-right",
    cell: (item) => <span className="font-mono text-sm">{item.cantidad}</span>,
  },
  {
    header: "Unitario",
    className: "text-right",
    cell: (item) => (
      <span className="font-mono text-sm text-muted-foreground">
        {formatoMoneda.format(Number(item.precioUnitario))}
      </span>
    ),
  },
  {
    header: "Importe",
    className: "text-right",
    cell: (item) => (
      <span className="font-mono text-sm font-medium">
        {formatoMoneda.format(item.cantidad * Number(item.precioUnitario))}
      </span>
    ),
  },
];

const MANO_OBRA_COLUMNS: DataTableColumn<ManoObraRow>[] = [
  {
    header: "Trabajo",
    cell: (linea) => <span className="text-sm">{linea.descripcion}</span>,
  },
  {
    header: "Mecánico",
    cell: (linea) => (
      <span className="text-sm text-muted-foreground">{linea.mecanico?.nombre ?? "Sin asignar"}</span>
    ),
  },
  {
    header: "Valor",
    className: "text-right",
    cell: (linea) => (
      <span className="font-mono text-sm font-medium">{formatoMoneda.format(Number(linea.valor))}</span>
    ),
  },
];

// Remove column only while the orden is still editable and for the roles the
// delete actions accept: `esOrdenMutable(orden) && role !== "TECNICO"`, mirroring
// their requireRole(ADMIN/RECEPCION). The add forms are looser (only gated by
// `!orden.factura`; the add actions allow TECNICO).
function conColumnaQuitar<T extends { id: string }>(
  columns: DataTableColumn<T>[],
  puedeQuitar: boolean,
  quitar: (fila: T) => { etiqueta: string; pregunta: string; accion: () => Promise<ResultadoAccion> },
): DataTableColumn<T>[] {
  if (!puedeQuitar) return columns;
  return [
    ...columns,
    {
      header: "",
      className: "text-right",
      cell: (fila) => <QuitarConConfirmacion {...quitar(fila)} />,
    },
  ];
}

export default async function OrdenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, orden, repuestos, tecnicos, bodegas, proveedores, dviItems, anticipos, servicios, opcionesTaller] = await Promise.all([
    requireSession(),
    getOrden(id),
    listRepuestoOptions(),
    listTecnicos(),
    listBodegas(),
    listProveedores(),
    listDviChecklistItems(),
    listAnticiposDeOrden(id),
    listServicios({ soloActivos: true }),
    getOpcionesTaller(),
  ]);

  if (!orden) {
    notFound();
  }

  const esAdmin = session.user.role === "ADMIN";
  const puedeQuitar = esOrdenMutable(orden) && session.user.role !== "TECNICO";
  const itemsColumns = conColumnaQuitar(ITEMS_COLUMNS, puedeQuitar, (item) => ({
    etiqueta: `Quitar ${item.descripcion}`,
    pregunta: `¿Quitar ${item.descripcion} de la orden?`,
    accion: deleteItemOrdenFormAction.bind(null, item.id, orden.id),
  }));
  const manoObraColumns = conColumnaQuitar(MANO_OBRA_COLUMNS, puedeQuitar, (linea) => ({
    etiqueta: `Quitar ${linea.descripcion}`,
    pregunta: `¿Quitar "${linea.descripcion}" de la orden?`,
    accion: deleteManoDeObraFormAction.bind(null, linea.id, orden.id),
  }));

  const repuestosTotal = orden.items.reduce((suma, item) => suma + item.cantidad * Number(item.precioUnitario), 0);
  const manoObraTotal = orden.manoDeObra.reduce((suma, linea) => suma + Number(linea.valor), 0);
  const checklist = (orden.dvi?.checklist as DviChecklist | undefined) ?? null;
  const checklistValores = checklist ? Object.values(checklist) : [];
  const atencionCount = checklistValores.filter((v) => v === "ATENCION").length;
  const criticoCount = checklistValores.filter((v) => v === "CRITICO").length;
  const anticiposVigentes = anticipos
    .filter((a) => a.estado !== "DEVUELTO")
    .reduce((suma, a) => suma + a.monto, 0);
  const mostrarAnticipos = !orden.factura || anticipos.length > 0;
  const puedeGestionarAnticipos = session.user.role !== "TECNICO";
  // Qué secciones van abiertas según el momento de la orden (el acta, plegada
  // mientras se arma: se usa al entregar).
  const abiertas = seccionesAbiertas(orden.estado);
  const resumenEntrega =
    orden.estado === "ENTREGADA"
      ? orden.acta?.firmadaAt
        ? "entregada con acta firmada"
        : "entregada"
      : orden.estado === "TERMINADA"
        ? "lista para entregar"
        : "se usa al entregar, cuando la orden esté Terminada";
  const total = totalOrden({
    items: orden.items.map((item) => ({ cantidad: item.cantidad, precioUnitario: Number(item.precioUnitario) })),
    manoDeObra: orden.manoDeObra.map((linea) => ({ valor: Number(linea.valor) })),
  });

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/ordenes"
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        ← Órdenes
      </Link>

      <CabeceraOrden
        datos={{
          id: orden.id,
          estado: orden.estado,
          ingreso: orden.createdAt,
          sede: orden.sede.nombre,
          recibio: orden.creadoPor.nombre,
          placa: orden.vehiculo.placa,
          marca: orden.vehiculo.marca,
          modelo: orden.vehiculo.modelo,
          anio: orden.vehiculo.anio,
          color: orden.vehiculo.color,
          tipo: orden.vehiculo.tipo,
          cliente: orden.cliente.nombre,
          telefono: orden.cliente.telefono,
        }}
        mecanico={
          <MecanicoMenu
            ordenId={orden.id}
            mecanico={orden.mecanico}
            tecnicos={tecnicos}
            editable={
              esOrdenMutable(orden) &&
              (session.user.role === "ADMIN" || (session.user.role === "RECEPCION" && !orden.mecanico))
            }
          />
        }
        acciones={<AvanceFase ordenId={orden.id} estado={orden.estado} />}
      />
      <BannerSintomas sintomas={orden.sintomas} />

      {/* Fija arriba al hacer scroll, como en el Inicio. */}
      <NavSecciones etiqueta="Secciones de la orden" secciones={SECCIONES_ORDEN} className="-mt-2" />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <SeccionOrden
            id="recepcion"
            titulo="Recepción y daños"
            resumen={`${orden.danios.length} ${orden.danios.length === 1 ? "marca" : "marcas"}`}
            abiertaInicial={abiertas.has("recepcion")}
            contenidoClassName="gap-5"
          >
            <RecepcionForm
              ordenId={orden.id}
              kilometrajeIngreso={orden.kilometrajeIngreso}
              nivelCombustible={orden.nivelCombustible}
              soloLectura={!esOrdenMutable(orden)}
            />
            <DiagramaDanios
              ordenId={orden.id}
              tipoVehiculo={orden.vehiculo.tipo}
              danios={orden.danios.map((danio) => ({
                id: danio.id,
                zona: danio.zona,
                tipo: danio.tipo,
                nota: danio.nota,
              }))}
              soloLectura={!esOrdenMutable(orden)}
              puedeQuitar={puedeQuitar}
            />
          </SeccionOrden>

          <SeccionOrden
            id="items"
            titulo="Ítems (repuestos)"
            resumen={`${orden.items.length} ${orden.items.length === 1 ? "ítem" : "ítems"}`}
            accion={
              <span className="font-mono text-sm text-muted-foreground">{formatoMoneda.format(repuestosTotal)}</span>
            }
            abiertaInicial={abiertas.has("items")}
          >
            {!orden.factura && (
              <>
                <AgregarItemForm
                  ordenId={orden.id}
                  repuestos={repuestos}
                  bodegas={bodegas}
                  proveedores={proveedores}
                  puedeCrearRepuesto={session.user.role !== "TECNICO"}
                />
                {/* Una sola instancia: el servicio escribe en Ítems y en Mano de obra. */}
                <AplicarServicioForm ordenId={orden.id} servicios={servicios} />
              </>
            )}
            <DataTable
              columns={itemsColumns}
              rows={orden.items}
              getRowKey={(item) => item.id}
              emptyMessage="Esta orden no tiene ítems agregados."
            />
          </SeccionOrden>

          <SeccionOrden
            id="mano-obra"
            titulo="Mano de obra"
            resumen={`${orden.manoDeObra.length} ${orden.manoDeObra.length === 1 ? "línea" : "líneas"}`}
            accion={
              <span className="font-mono text-sm text-muted-foreground">{formatoMoneda.format(manoObraTotal)}</span>
            }
            abiertaInicial={abiertas.has("mano-obra")}
          >
            {!orden.factura && (
              <AgregarManoObraForm ordenId={orden.id} tecnicos={tecnicos} mecanicoIdHeader={orden.mecanicoId} />
            )}
            <DataTable
              columns={manoObraColumns}
              rows={orden.manoDeObra}
              getRowKey={(linea) => linea.id}
              emptyMessage="Esta orden no tiene mano de obra registrada."
            />
          </SeccionOrden>

          <SeccionOrden
            id="dvi"
            titulo="Inspección vehicular digital (DVI)"
            accion={
              atencionCount + criticoCount > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {atencionCount > 0
                      ? `${atencionCount} ${atencionCount === 1 ? "punto requiere" : "puntos requieren"} atención`
                      : null}
                    {atencionCount > 0 && criticoCount > 0 ? " · " : null}
                    {criticoCount > 0 ? `${criticoCount} crítico${criticoCount > 1 ? "s" : ""}` : null}
                  </span>
              ) : undefined
            }
            abiertaInicial={abiertas.has("dvi")}
          >
            <DviChecklistForm
              ordenId={orden.id}
              checklist={checklist}
              items={dviItems}
              esAdmin={esAdmin}
              soloLectura={!esOrdenMutable(orden)}
            />
            <DviFotoForm ordenId={orden.id} fotos={orden.dvi?.fotos ?? []} soloLectura={!esOrdenMutable(orden)} puedeEliminar={puedeQuitar} />
          </SeccionOrden>

          <SeccionOrden
            id="entrega"
            titulo="Acta de entrega y garantías"
            resumen={resumenEntrega}
            // Se puede imprimir antes de firmar: firmar en papel y subir la foto es una de las dos formas.
            accion={
              orden.estado === "TERMINADA" || orden.estado === "ENTREGADA" ? (
                <Link href={`/ordenes/${orden.id}/acta/imprimir`} className="text-sm underline underline-offset-4">
                  Imprimir acta
                </Link>
              ) : undefined
            }
            abiertaInicial={abiertas.has("entrega")}
            destacada={orden.estado === "TERMINADA"}
            contenidoClassName="gap-5"
          >
            {/* Dos recuadros con título, como el resto de la ficha: antes las garantías
                quedaban pegadas al acta sin ningún título y no se encontraban. */}
            <FormGroup label="Acta de entrega">
              <ActaEntregaForm
                ordenId={orden.id}
                estado={orden.estado}
                // El acta no depende de la factura (fase de consolidación, D2): solo una
                // orden anulada la deja de solo lectura; una entregada sin firma se firma.
                editable={orden.estado !== "ANULADA"}
                exigirFirma={opcionesTaller.exigirActaFirmada}
                puedeBorrar={
                  orden.estado !== "ENTREGADA" && orden.estado !== "ANULADA" && session.user.role !== "TECNICO"
                }
                acta={
                  orden.acta
                    ? {
                        recibidoPor: orden.acta.recibidoPor,
                        documentoRecibe: orden.acta.documentoRecibe,
                        observaciones: orden.acta.observaciones,
                        firmaUrl: orden.acta.firmaUrl,
                        firmaFotoUrl: orden.acta.firmaFotoUrl,
                        firmadaAt: orden.acta.firmadaAt,
                      }
                    : null
                }
              />
            </FormGroup>
            <FormGroup label="Garantías del trabajo">
              <GarantiasSection
                ordenId={orden.id}
                garantias={orden.garantias.map((garantia) => ({
                  id: garantia.id,
                  tipo: garantia.tipo,
                  descripcion: garantia.descripcion,
                  linea: garantia.manoDeObra?.descripcion ?? garantia.itemOrden?.descripcion ?? null,
                  cubreHasta: garantia.cubreHasta,
                  cubreHastaKm: garantia.cubreHastaKm,
                  nota: garantia.nota,
                }))}
                lineasTrabajo={orden.manoDeObra.map((linea) => ({ id: linea.id, descripcion: linea.descripcion }))}
                lineasRepuesto={orden.items.map((item) => ({
                  id: item.id,
                  descripcion: `${item.descripcion} ×${item.cantidad}`,
                }))}
                soloLectura={orden.estado === "ENTREGADA" || orden.estado === "ANULADA"}
                puedeQuitar={puedeQuitar}
              />
            </FormGroup>
          </SeccionOrden>

          {mostrarAnticipos ? (
            <SeccionOrden
              id="anticipos"
              titulo="Anticipos"
              resumen={`${anticipos.length} ${anticipos.length === 1 ? "registro" : "registros"}`}
              abiertaInicial={abiertas.has("anticipos")}
            >
              <AnticiposSection
                ordenId={orden.id}
                anticipos={anticipos}
                puedeRegistrar={puedeGestionarAnticipos && !orden.factura && orden.estado !== "ANULADA"}
                puedeDevolver={esAdmin}
                ordenAnulada={orden.estado === "ANULADA"}
              />
            </SeccionOrden>
          ) : null}
        </div>

        {/* Franja de color arriba de cada tarjeta lateral: se distinguen sin
            meterles un recuadro gris (cada una muestra una sola cosa). */}
        <div className="sticky top-4 flex flex-col gap-4">
          {/* La franja toma el color del nivel; dentro, la prioridad es la protagonista. */}
          <Card className="border-t-4" style={{ borderTopColor: PRIORIDAD_COLOR[orden.prioridad] }}>
            <CardHeader>
              <CardTitle>Prioridad</CardTitle>
            </CardHeader>
            <CardContent>
              <PrioridadBloque ordenId={orden.id} prioridad={orden.prioridad} editable={esOrdenMutable(orden)} />
            </CardContent>
          </Card>

          <Card className="border-t-4" style={{ borderTopColor: ESTADO_DOT_COLOR[orden.estado] }}>
            <CardHeader>
              <CardTitle>Ciclo de la orden</CardTitle>
            </CardHeader>
            <CardContent>
              <CicloOrden estado={orden.estado} />
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-[oklch(0.4_0.1_150)]">
            <CardHeader>
              <CardTitle>Cuenta</CardTitle>
            </CardHeader>
            <CardContent>
              <CuentaOrden
                ordenId={orden.id}
                estado={orden.estado}
                repuestos={repuestosTotal}
                manoDeObra={manoObraTotal}
                total={total}
                anticipos={anticiposVigentes}
                factura={orden.factura ? { id: orden.factura.id, numero: orden.factura.numero } : null}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
