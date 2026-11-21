import Link from "next/link";
import {
  listFacturacionElectronicaTalleres,
  type FilaFeTaller,
} from "@/app/actions/super-admin-fe-actions";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { fechaHoraBogota } from "@/lib/factura-electronica/hora-bogota";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TokenBolsaForm } from "./token-bolsa-form";

const AMBIENTES: Record<string, string> = { SIMULADO: "Simulado", HABILITACION: "Habilitación", PRODUCCION: "Producción" };

function desplazarMes(mes: string, delta: number): string {
  const [anio, m] = mes.split("-").map(Number) as [number, number];
  const total = anio * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function textoEstado(fila: FilaFeTaller): string {
  if (fila.estado === "SIN_MIGRAR") return "Sin migrar";
  if (fila.estado === "SIN_CONFIGURAR") return "Sin configurar";
  const ambiente = fila.ambiente ? (AMBIENTES[fila.ambiente] ?? fila.ambiente) : "";
  return `${fila.activa ? "Activa" : "Inactiva"} · ${ambiente}`;
}

export default async function FacturacionElectronicaSuperAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  await requireSuperAdmin();
  const { mes: mesParam } = await searchParams;
  const mesActual = fechaHoraBogota(new Date()).fecha.slice(0, 7);
  const mes = mesParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam) ? mesParam : mesActual;
  const filas = await listFacturacionElectronicaTalleres(mes);

  const columns: DataTableColumn<FilaFeTaller>[] = [
    {
      header: "Taller",
      cell: (f) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{f.nombre ?? f.slug}</span>
          <span className="text-xs text-muted-foreground">{f.slug}</span>
        </div>
      ),
      searchValue: (f) => `${f.nombre ?? ""} ${f.slug}`,
    },
    { header: "Estado", cell: (f) => <Badge variant="outline">{textoEstado(f)}</Badge> },
    {
      header: "Cuenta",
      cell: (f) => (f.cuenta === "BOLSA" ? "Bolsa" : f.cuenta === "PROPIA" ? "Propia" : "—"),
    },
    {
      header: "Token",
      cell: (f) => (f.estado !== "CONFIGURADA" ? "—" : f.tokenRegistrado ? "Registrado" : "Falta"),
    },
    { header: "Aceptados en el mes", cell: (f) => f.aceptadosMes },
    {
      header: "Token de la bolsa",
      cell: (f) =>
        f.estado === "SIN_MIGRAR" || f.cuenta === "PROPIA" ? null : (
          <TokenBolsaForm tenantId={f.tenantId} tokenRegistrado={f.tokenRegistrado} />
        ),
    },
  ];

  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Facturación electrónica por taller</h1>
          <p className="text-sm text-muted-foreground">
            El cobro exacto se toma de los informes de consumo de Nextpyme; este número es de referencia.
          </p>
        </div>
        <Link href="/superadmin" className={buttonVariants({ variant: "outline" })}>
          Volver a talleres
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Mes {mes}</CardTitle>
          <div className="flex items-center gap-2">
            <Link
              href={`/superadmin/facturacion-electronica?mes=${desplazarMes(mes, -1)}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              ← mes anterior
            </Link>
            <Link
              href={`/superadmin/facturacion-electronica?mes=${desplazarMes(mes, 1)}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              mes siguiente →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={filas}
            getRowKey={(f) => f.tenantId}
            emptyMessage="No hay talleres registrados."
            searchable
            searchPlaceholder="Buscar por taller..."
            pageSize={10}
          />
        </CardContent>
      </Card>
    </main>
  );
}
