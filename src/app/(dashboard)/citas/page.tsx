import Link from "next/link";
import { listCitas, listVehiculosParaCita } from "@/app/actions/cita-actions";
import { NuevaCitaForm } from "./nueva-cita-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

type CitaRow = Awaited<ReturnType<typeof listCitas>>[number];

const COLUMNS: DataTableColumn<CitaRow>[] = [
  {
    header: "Cita",
    cell: (cita) => (
      <Link href={`/citas/${cita.id}`}>
        {`${formatoFecha.format(cita.fechaHora)} — ${cita.vehiculo.placa} — ${cita.motivo}`}
      </Link>
    ),
  },
  {
    header: "Estado",
    cell: (cita) => cita.estado,
  },
];

export default async function CitasPage() {
  // Both reads go through the actions module, so the guard and the sede filter
  // are applied in exactly one place instead of being restated here.
  const [citas, vehiculos] = await Promise.all([listCitas(), listVehiculosParaCita()]);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Citas</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nueva cita</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevaCitaForm vehiculos={vehiculos} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={citas}
            getRowKey={(cita) => cita.id}
            emptyMessage="No hay citas agendadas en esta sede."
          />
        </CardContent>
      </Card>
    </main>
  );
}
