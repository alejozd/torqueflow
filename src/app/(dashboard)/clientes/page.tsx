import { requireSession } from "@/lib/auth/guards";
import { listClientes } from "@/app/actions/cliente-actions";
import { NuevoClienteDialog } from "./nuevo-cliente-dialog";
import { ClientesTable, type ClienteRow } from "./clientes-table";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

export default async function ClientesPage() {
  const [session, clientes] = await Promise.all([requireSession(), listClientes()]);

  const filas: ClienteRow[] = clientes.map((cliente) => {
    const ultimaVisita = cliente.ordenes.reduce<Date | null>((masReciente, orden) => {
      if (!masReciente || orden.updatedAt > masReciente) return orden.updatedAt;
      return masReciente;
    }, null);

    return {
      id: cliente.id,
      nombre: cliente.nombre,
      documento: cliente.documento,
      telefono: cliente.telefono,
      email: cliente.email,
      placas: cliente.vehiculos.map((vehiculo) => vehiculo.placa),
      ultimaVisita: ultimaVisita ? formatoFecha.format(ultimaVisita) : null,
      ordenesCount: cliente.ordenes.length,
      saldo: cliente.facturas.reduce((suma, factura) => suma + Number(factura.saldoPendiente), 0),
    };
  });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {clientes.length} clientes registrados en Sede {session.user.sedeActivaNombre}
          </p>
        </div>
        <NuevoClienteDialog />
      </div>

      <ClientesTable clientes={filas} />
    </main>
  );
}
