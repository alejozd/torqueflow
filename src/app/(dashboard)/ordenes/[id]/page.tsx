import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrden } from "@/app/actions/orden-actions";
import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { CambiarEstadoForm } from "./cambiar-estado-form";
import { AgregarItemForm } from "./agregar-item-form";
import { AgregarManoObraForm } from "./agregar-mano-obra-form";
import { DviChecklistForm } from "./dvi-checklist-form";
import { DviFotoForm } from "./dvi-foto-form";
import { GenerarFacturaForm } from "./generar-factura-form";
import type { DviChecklist } from "@/lib/dvi/checklist-items";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Orden = NonNullable<Awaited<ReturnType<typeof getOrden>>>;
type ItemRow = Orden["items"][number];
type ManoObraRow = Orden["manoDeObra"][number];
type FotoRow = NonNullable<Orden["dvi"]>["fotos"][number];

const ITEMS_COLUMNS: DataTableColumn<ItemRow>[] = [
  {
    header: "Ítem",
    cell: (item) => (
      <>
        {item.descripcion} — {item.cantidad} x {item.precioUnitario.toString()}
      </>
    ),
  },
];

const MANO_OBRA_COLUMNS: DataTableColumn<ManoObraRow>[] = [
  {
    header: "Mano de obra",
    cell: (linea) => (
      <>
        {linea.descripcion} — {linea.horas.toString()}h x {linea.precioHora.toString()}
      </>
    ),
  },
];

const FOTOS_COLUMNS: DataTableColumn<FotoRow>[] = [
  {
    header: "Foto",
    cell: (foto) => (
      <>
        {foto.momento === "ANTES" ? "Antes" : "Después"}:{" "}
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated route, next/image's optimizer can't reach it */}
        <img src={foto.url} alt={`Foto ${foto.momento.toLowerCase()} de la inspección`} width={200} />
      </>
    ),
  },
];

export default async function OrdenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [orden, repuestos] = await Promise.all([getOrden(id), listRepuestoOptions()]);

  if (!orden) {
    notFound();
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        Orden — {orden.vehiculo.placa} ({orden.cliente.nombre})
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Información de la orden</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Sede</p>
              <p>{orden.sede.nombre}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mecánico</p>
              <p>{orden.mecanico?.nombre ?? "Sin asignar"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kilometraje de ingreso</p>
              <p>{orden.kilometrajeIngreso ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Síntomas</p>
              <p>{orden.sintomas ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estado: {orden.estado}</CardTitle>
        </CardHeader>
        <CardContent>
          <CambiarEstadoForm ordenId={orden.id} estadoActual={orden.estado} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ítems (repuestos)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!orden.factura && <AgregarItemForm ordenId={orden.id} repuestos={repuestos} />}
          <DataTable
            columns={ITEMS_COLUMNS}
            rows={orden.items}
            getRowKey={(item) => item.id}
            emptyMessage="Esta orden no tiene ítems agregados."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mano de obra</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!orden.factura && <AgregarManoObraForm ordenId={orden.id} />}
          <DataTable
            columns={MANO_OBRA_COLUMNS}
            rows={orden.manoDeObra}
            getRowKey={(linea) => linea.id}
            emptyMessage="Esta orden no tiene mano de obra registrada."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inspección vehicular digital (DVI)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DviChecklistForm
            ordenId={orden.id}
            checklist={(orden.dvi?.checklist as DviChecklist | undefined) ?? null}
          />
          <DviFotoForm ordenId={orden.id} />
          <DataTable
            columns={FOTOS_COLUMNS}
            rows={orden.dvi?.fotos ?? []}
            getRowKey={(foto) => foto.id}
            emptyMessage="Esta orden no tiene fotos de inspección."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Facturación</CardTitle>
        </CardHeader>
        <CardContent>
          {orden.factura ? (
            <p>
              <Link href={`/facturas/${orden.factura.id}`}>Ver factura #{orden.factura.numero}</Link>
            </p>
          ) : orden.estado === "TERMINADA" || orden.estado === "ENTREGADA" ? (
            <GenerarFacturaForm ordenId={orden.id} />
          ) : (
            <p>La orden debe estar Terminada o Entregada para poder facturarse.</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
