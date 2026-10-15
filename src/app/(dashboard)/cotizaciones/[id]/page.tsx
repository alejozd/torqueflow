import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { getCotizacion } from "@/app/actions/cotizacion-actions";
import { conceptosDesdeItems, contarConceptos, importeConcepto } from "@/lib/cotizacion/agrupar-conceptos";
import { esCotizacionMutable } from "@/lib/cotizacion/mutable-guard";
import { etiquetaDescuento, porcentajeVisible } from "@/lib/cotizacion/totales";
import type { TipoSeguimiento } from "@/generated/prisma-tenant";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatoFechaCorta } from "@/lib/fecha-bogota";
import { CabeceraCotizacion, ESTADO_LABELS } from "./cabecera-cotizacion";
import { TablaConceptos } from "./tabla-conceptos";
import { ResumenCotizacion } from "./resumen-cotizacion";
import { DescuentoCotizacionForm } from "./descuento-cotizacion-form";
import { EnviarCotizacionForm } from "./enviar-cotizacion-form";
import { DecisionCotizacionButtons } from "./decision-cotizacion-buttons";
import { RegistrarSeguimientoDialog } from "./registrar-seguimiento-dialog";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

const TIPO_SEGUIMIENTO_LABELS: Record<TipoSeguimiento, string> = {
  LLAMADA: "Llamada",
  WHATSAPP: "WhatsApp",
  EMAIL: "Correo electrónico",
  VISITA: "Visita",
  NOTA: "Nota",
};

const TIPO_SEGUIMIENTO_BADGE_CLASSNAME: Record<TipoSeguimiento, string> = {
  LLAMADA: "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[oklch(0.44_0.12_250)]",
  WHATSAPP: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  EMAIL: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  VISITA: "border-transparent bg-[oklch(0.55_0.2_300/0.12)] text-[oklch(0.5_0.18_300)]",
  NOTA: "",
};

// Same "fecha · hora" split as citas/[id]/page.tsx: formatoFechaCorta (shared,
// src/lib/fecha-bogota.ts) for the date, plus a local Bogota hour formatter.
const formatoHoraSeguimiento = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Bogota",
});

export default async function CotizacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cotizacion = await getCotizacion(id);

  if (!cotizacion) {
    notFound();
  }

  const ahora = new Date();
  const puedeEditar = esCotizacionMutable(cotizacion.estado);
  const conceptos = conceptosDesdeItems(cotizacion.items);
  const conteo = contarConceptos(conceptos);
  const subtotalRepuestos = conceptos
    .filter((concepto) => concepto.tipo === "REPUESTO")
    .reduce((suma, concepto) => suma + importeConcepto(concepto), 0);
  const subtotalManoObra = conceptos
    .filter((concepto) => concepto.tipo === "MANO_OBRA")
    .reduce((suma, concepto) => suma + importeConcepto(concepto), 0);
  const descuentoPctVisible = porcentajeVisible(cotizacion.descuentoTipo, Number(cotizacion.descuentoPct));

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/cotizaciones"
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        ← Cotizaciones
      </Link>

      <CabeceraCotizacion
        ahora={ahora}
        datos={{
          numero: cotizacion.numero,
          estado: cotizacion.estado,
          creada: cotizacion.createdAt,
          creadoPor: cotizacion.creadoPor.nombre,
          validaHasta: cotizacion.validaHasta,
          sede: cotizacion.sede.nombre,
          motivo: cotizacion.motivo,
          placa: cotizacion.vehiculo.placa,
          marca: cotizacion.vehiculo.marca,
          modelo: cotizacion.vehiculo.modelo,
          anio: cotizacion.vehiculo.anio,
          color: cotizacion.vehiculo.color,
          cliente: cotizacion.cliente.nombre,
          telefono: cotizacion.cliente.telefono,
          email: cotizacion.cliente.email,
        }}
        acciones={
          <Link
            href={`/cotizaciones/${cotizacion.id}/imprimir`}
            target="_blank"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Printer className="size-4" aria-hidden />
            Imprimir / PDF
          </Link>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Conceptos cotizados
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {conteo.total === 1 ? "1 ítem" : `${conteo.total} ítems`}
                </span>
              </CardTitle>
              {puedeEditar ? (
                <p className="text-sm text-muted-foreground">
                  Busca repuestos del inventario, servicios o kits; cada cambio se guarda solo.
                </p>
              ) : null}
            </CardHeader>
            <CardContent>
              <TablaConceptos cotizacionId={cotizacion.id} conceptos={conceptos} puedeEditar={puedeEditar} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Historial de seguimiento{" "}
                <span className="font-normal text-muted-foreground">
                  · {cotizacion.seguimientos.length} {cotizacion.seguimientos.length === 1 ? "registro" : "registros"}
                </span>
              </CardTitle>
              <CardAction>
                <RegistrarSeguimientoDialog cotizacionId={cotizacion.id} />
              </CardAction>
            </CardHeader>
            <CardContent>
              {cotizacion.seguimientos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay seguimientos registrados.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {cotizacion.seguimientos.map((seguimiento) => (
                    <div key={seguimiento.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={TIPO_SEGUIMIENTO_BADGE_CLASSNAME[seguimiento.tipo]}>
                          {TIPO_SEGUIMIENTO_LABELS[seguimiento.tipo]}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatoFechaCorta.format(seguimiento.fecha)} · {formatoHoraSeguimiento.format(seguimiento.fecha)}
                        </span>
                      </div>
                      <p className="text-sm">{seguimiento.resultado}</p>
                      {seguimiento.proximoSeguimiento ? (
                        <p className="text-xs text-muted-foreground">
                          Próximo seguimiento: {formatoFechaCorta.format(seguimiento.proximoSeguimiento)}
                        </p>
                      ) : null}
                      <p className="text-[10px] text-muted-foreground">Registrado por {seguimiento.creadoPor.nombre}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          <ResumenCotizacion
            subtotalRepuestos={subtotalRepuestos}
            subtotalManoObra={subtotalManoObra}
            subtotal={Number(cotizacion.subtotal)}
            descuento={Number(cotizacion.descuento)}
            etiquetaDescuento={etiquetaDescuento(descuentoPctVisible)}
            iva={Number(cotizacion.iva)}
            total={Number(cotizacion.total)}
            editorDescuento={
              puedeEditar ? (
                <DescuentoCotizacionForm
                  cotizacionId={cotizacion.id}
                  descuentoTipo={cotizacion.descuentoTipo}
                  descuentoPct={Number(cotizacion.descuentoPct)}
                  descuentoMonto={Number(cotizacion.descuentoMonto)}
                />
              ) : undefined
            }
          />

          {cotizacion.estado === "ENVIADA" ? (
            <Card className="border-2 border-primary/40 bg-primary/[0.03]">
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
                    <span className="size-2 rounded-full bg-primary" />
                    Decisión del cliente
                  </span>
                  {cotizacion.validaHasta ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      Válida hasta {formatoFecha.format(cotizacion.validaHasta)}
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <DecisionCotizacionButtons cotizacionId={cotizacion.id} />
                <p className="text-center text-xs text-muted-foreground">
                  Al aprobar se crea la orden de trabajo con estos conceptos, agrupados igual que aquí.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {cotizacion.estado === "APROBADA" ? (
            <Card>
              <CardHeader>
                <CardTitle>Resultado</CardTitle>
              </CardHeader>
              <CardContent>
                {cotizacion.orden ? (
                  <Link href={`/ordenes/${cotizacion.orden.id}`} className="text-sm font-medium text-primary hover:underline">
                    Ver orden generada →
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">Cotización aprobada.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {cotizacion.estado === "RECHAZADA" || cotizacion.estado === "VENCIDA" ? (
            <Card>
              <CardHeader>
                <CardTitle>Estado final</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Esta cotización quedó {ESTADO_LABELS[cotizacion.estado].toLowerCase()} y ya no admite cambios.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{cotizacion.estado === "BORRADOR" ? "Enviar al cliente" : "Reenviar y compartir"}</CardTitle>
            </CardHeader>
            <CardContent>
              <EnviarCotizacionForm
                cotizacionId={cotizacion.id}
                cliente={{ nombre: cotizacion.cliente.nombre, telefono: cotizacion.cliente.telefono }}
                resumen={{
                  numero: cotizacion.numero,
                  placa: cotizacion.vehiculo.placa,
                  items: conceptos.map((concepto) => ({
                    descripcion: concepto.descripcion,
                    importe: importeConcepto(concepto),
                  })),
                  subtotal: Number(cotizacion.subtotal),
                  descuento: Number(cotizacion.descuento),
                  descuentoPct: descuentoPctVisible,
                  iva: Number(cotizacion.iva),
                  total: Number(cotizacion.total),
                }}
                esReenvio={cotizacion.estado !== "BORRADOR"}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
