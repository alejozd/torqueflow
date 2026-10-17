import Link from "next/link";
import { Package } from "lucide-react";
import { COLOR_TONO, pestanaInicial, pestanasGestionadas, resumenEntrega, resumenInspeccion } from "@/lib/orden/pestanas";
import { PestanasOrden } from "./pestanas-orden";
import { AgregarAlTrabajo } from "./agregar-al-trabajo";
import { notFound } from "next/navigation";
import { getOrden, listTecnicos } from "@/app/actions/orden-actions";
import { puede, requirePermiso } from "@/lib/auth/guards";
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
import { resumirKitsDeOrden } from "@/lib/orden/kits-orden";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Orden = NonNullable<Awaited<ReturnType<typeof getOrden>>>;
type ItemRow = Orden["items"][number];
type ManoObraRow = Orden["manoDeObra"][number];

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** Marca las líneas que salieron de un kit aplicado (en la cotización o aquí). */
function EtiquetaKit({ nombre }: { nombre: string | null }) {
  if (!nombre) return null;
  return (
    <span className="mt-0.5 flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
      <Package className="size-3" aria-hidden />
      Kit · {nombre}
    </span>
  );
}

const ITEMS_COLUMNS: DataTableColumn<ItemRow>[] = [
  {
    header: "Concepto",
    cell: (item) => (
      <div className="flex flex-col">
        <span className="text-sm">{item.descripcion}</span>
        <EtiquetaKit nombre={item.grupoKitNombre} />
      </div>
    ),
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
    cell: (linea) => (
      <div className="flex flex-col">
        <span className="text-sm">{linea.descripcion}</span>
        <EtiquetaKit nombre={linea.grupoKitNombre} />
      </div>
    ),
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
// delete actions accept: `esOrdenMutable(orden) && puede(session, "ordenes.quitar")`,
// mirroring their requirePermiso. The add forms are looser (only gated by
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

export default async function OrdenDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const session = await requirePermiso("ordenes.ver");
  const [orden, repuestos, tecnicos, bodegas, proveedores, dviItems, anticipos, servicios, opcionesTaller] = await Promise.all([
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

  const puedeQuitar = esOrdenMutable(orden) && puede(session, "ordenes.quitar");
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
  const kits = resumirKitsDeOrden(
    orden.items.map((item) => ({ ...item, precioUnitario: Number(item.precioUnitario) })),
    orden.manoDeObra.map((linea) => ({ ...linea, valor: Number(linea.valor) })),
  );
  const checklist = (orden.dvi?.checklist as DviChecklist | undefined) ?? null;
  // Solo cuentan los ítems activos: un ítem desactivado no se puede revisar.
  const itemsDviActivos = dviItems.filter((item) => item.activo);
  const inspeccion = resumenInspeccion(
    itemsDviActivos.flatMap((item) => checklist?.[item.key] ?? []),
    itemsDviActivos.length,
  );
  const entrega = resumenEntrega(orden.estado, Boolean(orden.acta?.firmadaAt));
  const gestionadas = pestanasGestionadas({
    estado: orden.estado,
    kilometraje: orden.kilometrajeIngreso,
    combustible: orden.nivelCombustible,
    lineasTrabajo: orden.items.length + orden.manoDeObra.length,
    revisados: itemsDviActivos.filter((item) => checklist?.[item.key]).length,
    totalChecklist: itemsDviActivos.length,
    actaFirmada: Boolean(orden.acta?.firmadaAt),
  });
  const anticiposVigentes = anticipos
    .filter((a) => a.estado !== "DEVUELTO")
    .reduce((suma, a) => suma + a.monto, 0);
  const mostrarAnticipos = !orden.factura || anticipos.length > 0;
  const puedeGestionarAnticipos = puede(session, "anticipos.registrar");
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
              (puede(session, "ordenes.reasignarMecanico") || (puede(session, "ordenes.planificar") && !orden.mecanico))
            }
          />
        }
        acciones={
          // En pantallas angostas el avance va en la franja fija de abajo.
          <div className="hidden lg:block">
            <AvanceFase ordenId={orden.id} estado={orden.estado} puedeAnular={puede(session, "ordenes.anular")} />
          </div>
        }
      />
      <BannerSintomas sintomas={orden.sintomas} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PestanasOrden
          inicial={pestanaInicial(orden.estado, tab)}
          pestanas={[
            {
              id: "recepcion",
              gestionada: gestionadas.recepcion,
              titulo: "Recepción",
              resumen: `${orden.danios.length} ${orden.danios.length === 1 ? "daño" : "daños"}`,
              color: COLOR_TONO[orden.danios.length > 0 ? "rojo" : "gris"],
              panel: (
                <Card>
                  <CardHeader>
                    <CardTitle>Recepción del vehículo</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
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
                  </CardContent>
                </Card>
              ),
            },
            {
              id: "trabajo",
              gestionada: gestionadas.trabajo,
              titulo: "Trabajo",
              resumen: formatoMoneda.format(total),
              color: COLOR_TONO.ambar,
              panel: (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      { etiqueta: "Repuestos", valor: repuestosTotal },
                      { etiqueta: "Mano de obra", valor: manoObraTotal },
                      { etiqueta: "Total del trabajo", valor: total },
                    ].map((cifra) => (
                      <Card key={cifra.etiqueta} className="gap-1 px-4 py-3">
                        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{cifra.etiqueta}</span>
                        <span className="font-mono text-lg font-semibold">{formatoMoneda.format(cifra.valor)}</span>
                      </Card>
                    ))}
                  </div>
                  {kits.length > 0 ? (
                    <Card className="gap-2 px-4 py-3">
                      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Kits aplicados</span>
                      <ul className="flex flex-col divide-y divide-border">
                        {kits.map((kit) => (
                          <li key={kit.grupoKitId} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                            <span className="flex items-center gap-2">
                              <Package className="size-4 text-primary" aria-hidden />
                              <span className="font-medium">{kit.nombre}</span>
                              <span className="text-xs text-muted-foreground">
                                {kit.conceptos === 1 ? "1 concepto" : `${kit.conceptos} conceptos`}
                              </span>
                            </span>
                            <span className="font-mono">{formatoMoneda.format(kit.subtotal)}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  ) : null}
                  {!orden.factura && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Agregar al trabajo</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <AgregarAlTrabajo
                          opciones={[
                            {
                              id: "servicio",
                              etiqueta: "Aplicar servicio",
                              detalle: "repuestos + mano de obra",
                              contenido: <AplicarServicioForm ordenId={orden.id} servicios={servicios} />,
                            },
                            {
                              id: "repuesto",
                              etiqueta: "Repuesto",
                              contenido: (
                                <AgregarItemForm
                                  ordenId={orden.id}
                                  repuestos={repuestos}
                                  bodegas={bodegas}
                                  proveedores={proveedores}
                                  puedeCrearRepuesto={puede(session, "inventario.editar")}
                                />
                              ),
                            },
                            {
                              id: "mano-obra",
                              etiqueta: "Mano de obra",
                              contenido: (
                                <AgregarManoObraForm
                                  ordenId={orden.id}
                                  tecnicos={tecnicos}
                                  mecanicoIdHeader={orden.mecanicoId}
                                />
                              ),
                            },
                          ]}
                        />
                      </CardContent>
                    </Card>
                  )}
                  <Card>
                    <CardHeader>
                      <CardTitle>Repuestos</CardTitle>
                      <CardAction className="text-sm text-muted-foreground">
                        {orden.items.length} {orden.items.length === 1 ? "ítem" : "ítems"}
                      </CardAction>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <DataTable
                        columns={itemsColumns}
                        rows={orden.items}
                        getRowKey={(item) => item.id}
                        emptyMessage="Esta orden no tiene repuestos agregados."
                      />
                      <div className="flex justify-between px-2 text-sm font-semibold">
                        <span>Subtotal repuestos</span>
                        <span className="font-mono">{formatoMoneda.format(repuestosTotal)}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Mano de obra</CardTitle>
                      <CardAction className="text-sm text-muted-foreground">
                        {orden.manoDeObra.length} {orden.manoDeObra.length === 1 ? "línea" : "líneas"}
                      </CardAction>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <DataTable
                        columns={manoObraColumns}
                        rows={orden.manoDeObra}
                        getRowKey={(linea) => linea.id}
                        emptyMessage="Esta orden no tiene mano de obra registrada."
                      />
                      <div className="flex justify-between px-2 text-sm font-semibold">
                        <span>Subtotal mano de obra</span>
                        <span className="font-mono">{formatoMoneda.format(manoObraTotal)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ),
            },
            {
              id: "inspeccion",
              gestionada: gestionadas.inspeccion,
              titulo: "Inspección",
              resumen: inspeccion.texto,
              color: COLOR_TONO[inspeccion.tono],
              panel: (
                <Card>
                  <CardContent className="flex flex-col gap-5">
                    <DviChecklistForm
                      ordenId={orden.id}
                      checklist={checklist}
                      items={dviItems}
                      puedeConfigurarChecklist={puede(session, "configuracion.taller")}
                      soloLectura={!esOrdenMutable(orden)}
                    />
                    <DviFotoForm
                      ordenId={orden.id}
                      fotos={orden.dvi?.fotos ?? []}
                      soloLectura={!esOrdenMutable(orden)}
                      puedeEliminar={puedeQuitar}
                    />
                  </CardContent>
                </Card>
              ),
            },
            {
              id: "entrega",
              gestionada: gestionadas.entrega,
              titulo: "Entrega",
              resumen: entrega.texto,
              color: COLOR_TONO[entrega.tono],
              panel: (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Acta de entrega</CardTitle>
                      {/* Se puede imprimir antes de firmar: firmar en papel y subir la foto es una de las dos formas. */}
                      {orden.estado === "TERMINADA" || orden.estado === "ENTREGADA" ? (
                        <CardAction>
                          <Link
                            href={`/ordenes/${orden.id}/acta/imprimir`}
                            className="text-sm underline underline-offset-4"
                          >
                            Imprimir acta
                          </Link>
                        </CardAction>
                      ) : null}
                    </CardHeader>
                    <CardContent>
                      <ActaEntregaForm
                        ordenId={orden.id}
                        estado={orden.estado}
                        // El acta no depende de la factura (fase de consolidación, D2): solo una
                        // orden anulada la deja de solo lectura; una entregada sin firma se firma.
                        editable={orden.estado !== "ANULADA"}
                        exigirFirma={opcionesTaller.exigirActaFirmada}
                        puedeBorrar={
                          orden.estado !== "ENTREGADA" &&
                          orden.estado !== "ANULADA" &&
                          puede(session, "ordenes.quitar")
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
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Garantías del trabajo</CardTitle>
                    </CardHeader>
                    <CardContent>
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
                    </CardContent>
                  </Card>
                  {mostrarAnticipos ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>Anticipos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <AnticiposSection
                          ordenId={orden.id}
                          anticipos={anticipos}
                          puedeRegistrar={puedeGestionarAnticipos && !orden.factura && orden.estado !== "ANULADA"}
                          puedeDevolver={puede(session, "anticipos.devolver")}
                          ordenAnulada={orden.estado === "ANULADA"}
                        />
                      </CardContent>
                    </Card>
                  ) : null}
                </>
              ),
            },
          ]}
        />

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

      {/* En pantallas angostas la barra lateral queda abajo: el saldo y el siguiente paso siguen a mano. */}
      <div className="sticky bottom-0 z-20 -mx-6 -mb-6 flex items-center gap-3 border-t border-border bg-card px-6 py-2.5 shadow-[0_-6px_16px_rgb(0_0_0/0.06)] lg:hidden">
        <div className="flex flex-col">
          <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Saldo por cobrar</span>
          <span className="font-mono text-lg font-semibold">
            {formatoMoneda.format(Math.max(total - anticiposVigentes, 0))}
          </span>
        </div>
        <div className="ml-auto">
          <AvanceFase ordenId={orden.id} estado={orden.estado} puedeAnular={puede(session, "ordenes.anular")} />
        </div>
      </div>
    </main>
  );
}
