"use client";

import Link from "next/link";
import type { ClienteCarteraVista } from "@/app/actions/cartera-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { CobrarWhatsappButton } from "./cobrar-whatsapp-button";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function monto(valor: number, peligro = false) {
  if (valor === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={peligro ? "font-mono font-medium text-red-600 dark:text-red-400" : "font-mono"}>
      {formatoMoneda.format(valor)}
    </span>
  );
}

export function CarteraTable({ clientes }: { clientes: ClienteCarteraVista[] }) {
  const columns: DataTableColumn<ClienteCarteraVista>[] = [
    {
      header: "Cliente",
      cell: (c) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{c.clienteNombre}</span>
          <div className="flex flex-wrap gap-1">
            {c.facturas.map((f) => (
              <Link key={f.facturaId} href={`/facturas/${f.facturaId}`} className="hover:underline">
                <Badge variant="outline" className="font-mono font-normal">
                  #{f.numero} · {f.dias} d
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      ),
    },
    { header: "Saldo", className: "text-right", cell: (c) => <span className="font-mono font-semibold">{formatoMoneda.format(c.saldoTotal)}</span> },
    { header: "Más antigua", className: "text-right", cell: (c) => <span className="font-mono">{c.diasMasAntigua} días</span> },
    { header: "0–30", className: "text-right", cell: (c) => monto(c.porRango["0-30"]) },
    { header: "31–60", className: "text-right", cell: (c) => monto(c.porRango["31-60"]) },
    { header: "61–90", className: "text-right", cell: (c) => monto(c.porRango["61-90"]) },
    { header: "> 90", className: "text-right", cell: (c) => monto(c.porRango["90+"], true) },
    { header: "", className: "text-right", cell: (c) => <CobrarWhatsappButton urlWhatsapp={c.urlWhatsapp} /> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={clientes}
      getRowKey={(c) => c.clienteId}
      emptyMessage="No hay facturas con saldo pendiente."
    />
  );
}
