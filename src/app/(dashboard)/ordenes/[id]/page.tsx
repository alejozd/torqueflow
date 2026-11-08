import Link from "next/link";
import { COLOR_TONO, pestanaInicial, pestanasGestionadas, resumenEntrega, resumenInspeccion } from "@/lib/orden/pestanas";
import { PestanasOrden } from "./pestanas-orden";
import { notFound } from "next/navigation";
import { getOrden, listTecnicos } from "@/app/actions/orden-actions";
import { puede, requirePermiso } from "@/lib/auth/guards";
import { listBodegas } from "@/app/actions/bodega-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { listDviChecklistItems } from "@/app/actions/dvi-checklist-item-actions";
import { listAnticiposDeOrden } from "@/app/actions/anticipo-actions";
import { getOpcionesTaller } from "@/app/actions/configuracion-taller-actions";
import { AnticiposSection } from "./anticipos-section";
import { AvanceFase } from "./avance-fase";
import { BannerSintomas, CabeceraOrden } from "./cabecera-orden";
import { CicloOrden } from "./ciclo-orden";
import { CuentaOrden } from "./cuenta-orden";
import { ConceptosOrden } from "./conceptos-orden";
import { conceptosDesdeOrden } from "@/lib/orden/conceptos-orden";
import { MecanicoMenu } from "./mecanico-menu";
import { PrioridadBloque } from "../prioridad-bloque";
import { PRIORIDAD_COLOR } from "../prioridad-tono";
import { ESTADO_DOT_COLOR } from "../estado-tono";
import { DiagramaDanios } from "./diagrama-danios";
import { GarantiasSection } from "./garantias-section";
import { RecepcionForm } from "./recepcion-form";
import { ActaEntregaForm } from "./acta-entrega-form";
import { DviChecklistForm } from "./dvi-checklist-form";
import { DviFotoForm } from "./dvi-foto-form";
import { esOrdenMutable } from "@/lib/orden/mutable-guard";
import type { DviChecklist } from "@/lib/dvi/checklist-items";
import { totalOrden } from "@/lib/dashboard/calculos";
import { computeFacturaTotales } from "@/lib/factura/totales";
import { leerDesgloseGuardado } from "@/lib/iva/desglose";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

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
  const [orden, tecnicos, bodegas, proveedores, dviItems, anticipos, opcionesTaller] = await Promise.all([
    getOrden(id),
    listTecnicos(),
    listBodegas(),
    listProveedores(),
    listDviChecklistItems(),
    listAnticiposDeOrden(id),
    getOpcionesTaller(),
  ]);

  if (!orden) {
    notFound();
  }

  const editable = esOrdenMutable(orden);
  const puedeQuitar = editable && puede(session, "ordenes.quitar");
  const conceptos = conceptosDesdeOrden(orden.items, orden.manoDeObra);

  const repuestosTotal = orden.items.reduce((suma, item) => suma + item.cantidad * Number(item.precioUnitario), 0);
  const manoObraTotal = orden.manoDeObra.reduce((suma, linea) => suma + Number(linea.valor), 0);
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
  // La cuenta con IVA: si ya hay factura, lo que quedó en ella; si no, el IVA de cada línea.
  const cuenta = orden.factura
    ? {
        descuento: Number(orden.factura.descuento),
        desgloseIva: leerDesgloseGuardado(orden.factura.desgloseIva),
        total: Number(orden.factura.total),
      }
    : (() => {
        const calculo = computeFacturaTotales({
          items: orden.items.map((item) => ({
            cantidad: item.cantidad,
            precioUnitario: Number(item.precioUnitario),
            ivaPct: Number(item.ivaPct),
          })),
          manoDeObra: orden.manoDeObra.map((linea) => ({ valor: Number(linea.valor), ivaPct: Number(linea.ivaPct) })),
          descuento: 0,
        });
        return { descuento: 0, desgloseIva: calculo.desgloseIva, total: calculo.total };
      })();

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
                  <Card>
                    <CardHeader>
                      <CardTitle>Conceptos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ConceptosOrden
                        ordenId={orden.id}
                        conceptos={conceptos}
                        puedeEditar={editable && puede(session, "ordenes.trabajar")}
                        puedeQuitar={puedeQuitar}
                        tecnicos={tecnicos}
                        crearRepuesto={
                          puede(session, "inventario.editar")
                            ? { bodegas, proveedores, verCostos: puede(session, "inventario.costos") }
                            : null
                        }
                      />
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
                        permitirEntrega={puede(session, "ordenes.entregar")}
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
                descuento={cuenta.descuento}
                desgloseIva={cuenta.desgloseIva}
                total={cuenta.total}
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
