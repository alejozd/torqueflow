import { AlertCircle, Car, UserPlus, Users } from "lucide-react";
import { requireSession } from "@/lib/auth/guards";
import { listClientes } from "@/app/actions/cliente-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { formatoFechaRelativa, inicioMesBogota } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";
import { NuevoClienteDialog } from "./nuevo-cliente-dialog";
import { ClientesTable, type ClienteRow } from "./clientes-table";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

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
      vehiculos: cliente.vehiculos.map((vehiculo) => ({ placa: vehiculo.placa, color: vehiculo.color })),
      ultimaVisita,
      ordenesCount: cliente.ordenes.length,
      saldo: cliente.facturas.reduce((suma, factura) => suma + Number(factura.saldoPendiente), 0),
    };
  });

  const ahora = new Date();
  const inicioMes = inicioMesBogota(ahora);
  const nuevosMes = clientes.filter((cliente) => cliente.createdAt >= inicioMes).length;
  const conSaldoPendiente = filas.filter((fila) => fila.saldo > 0).length;
  const totalSaldoPendiente = filas.reduce((suma, fila) => suma + fila.saldo, 0);
  const vehiculosRegistrados = clientes.reduce((suma, cliente) => suma + cliente.vehiculos.length, 0);
  const clientesConVehiculo = clientes.filter((cliente) => cliente.vehiculos.length > 0).length;
  const promedioVehiculosPorCliente = clientes.length > 0 ? vehiculosRegistrados / clientes.length : 0;
  const ultimaVisitaGeneral = filas.reduce<Date | null>((masReciente, fila) => {
    if (!fila.ultimaVisita) return masReciente;
    if (!masReciente || fila.ultimaVisita > masReciente) return fila.ultimaVisita;
    return masReciente;
  }, null);

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
            Sede {session.user.sedeActivaNombre}
            {ultimaVisitaGeneral ? ` · Última visita: ${formatoFechaRelativa(ultimaVisitaGeneral, ahora).toLowerCase()}` : ""}
          </p>
        </div>
        <NuevoClienteDialog />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Clientes"
          value={clientes.length}
          subtitle={`${clientesConVehiculo} con vehículo registrado`}
          icon={<Users className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Nuevos este mes"
          value={nuevosMes}
          subtitle={`${nuevosMes} ${nuevosMes === 1 ? "cliente nuevo" : "clientes nuevos"} este mes`}
          icon={<UserPlus className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Con saldo pendiente"
          value={conSaldoPendiente}
          valueColor="warning"
          subtitle={`${formatoMoneda.format(totalSaldoPendiente)} en saldo pendiente`}
          subtitleColor="warning"
          subtitleIcon="dot"
          highlight={conSaldoPendiente > 0}
          icon={<AlertCircle className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />

        <KpiCard
          title="Vehículos registrados"
          value={vehiculosRegistrados}
          subtitle={clientes.length > 0 ? `${promedioVehiculosPorCliente.toFixed(1)} por cliente en promedio` : "Sin clientes registrados"}
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
