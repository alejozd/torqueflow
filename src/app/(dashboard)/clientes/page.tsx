import { AlertCircle, Car, UserPlus, Users } from "lucide-react";
import { requireSession } from "@/lib/auth/guards";
import { listClientes } from "@/app/actions/cliente-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { inicioMesBogota } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";
import { NuevoClienteDialog } from "./nuevo-cliente-dialog";
import { ClientesTable, type ClienteRow } from "./clientes-table";

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
      ultimaVisita,
      ordenesCount: cliente.ordenes.length,
      saldo: cliente.facturas.reduce((suma, factura) => suma + Number(factura.saldoPendiente), 0),
    };
  });

  const ahora = new Date();
  const inicioMes = inicioMesBogota(ahora);
  const nuevosMes = clientes.filter((cliente) => cliente.createdAt >= inicioMes).length;
  const conSaldoPendiente = filas.filter((fila) => fila.saldo > 0).length;
  const vehiculosRegistrados = clientes.reduce((suma, cliente) => suma + cliente.vehiculos.length, 0);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold">Clientes</h1>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {nuevosMes} {nuevosMes === 1 ? "cliente" : "clientes"} este mes
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {clientes.length} clientes registrados en Sede {session.user.sedeActivaNombre}
          </p>
        </div>
        <NuevoClienteDialog />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Clientes"
          value={clientes.length}
          icon={<Users className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Nuevos este mes"
          value={nuevosMes}
          icon={<UserPlus className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Con saldo pendiente"
          value={conSaldoPendiente}
          valueColor="warning"
          icon={<AlertCircle className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />

        <KpiCard
          title="Vehículos registrados"
          value={vehiculosRegistrados}
          icon={<Car className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientesTable clientes={filas} ahora={ahora} />
        </CardContent>
      </Card>
    </main>
  );
}
