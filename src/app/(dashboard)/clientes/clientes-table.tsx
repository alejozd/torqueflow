"use client";

import { useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ClienteRow {
  id: string;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  placas: string[];
  ultimaVisita: string | null;
  ordenesCount: number;
  saldo: number;
}

const PAGE_SIZE = 20;

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function coincide(cliente: ClienteRow, termino: string): boolean {
  const objetivo = termino.trim().toLowerCase();
  if (!objetivo) return true;
  return (
    cliente.nombre.toLowerCase().includes(objetivo) ||
    (cliente.documento?.toLowerCase().includes(objetivo) ?? false) ||
    (cliente.telefono?.toLowerCase().includes(objetivo) ?? false)
  );
}

export function ClientesTable({ clientes }: { clientes: ClienteRow[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);

  const filtrados = useMemo(() => {
    const resultado = clientes.filter((cliente) => coincide(cliente, busqueda));
    return resultado;
  }, [clientes, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * PAGE_SIZE;
  const visibles = filtrados.slice(inicio, inicio + PAGE_SIZE);

  const COLUMNS: DataTableColumn<ClienteRow>[] = [
    {
      header: "Cliente",
      cell: (cliente) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{cliente.nombre}</span>
          <span className="text-xs text-muted-foreground">{cliente.documento ?? "—"}</span>
        </div>
      ),
    },
    {
      header: "Teléfono",
      cell: (cliente) => <span className="font-mono text-sm">{cliente.telefono ?? "—"}</span>,
    },
    {
      header: "Correo",
      cell: (cliente) => <span className="text-muted-foreground">{cliente.email ?? "—"}</span>,
    },
    {
      header: "Vehículos",
      cell: (cliente) =>
        cliente.placas.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {cliente.placas.map((placa) => (
              <Badge key={placa} variant="outline" className="font-mono">
                {placa}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      header: "Última visita",
      cell: (cliente) => cliente.ultimaVisita ?? "—",
    },
    {
      header: "Órdenes",
      cell: (cliente) => <span className="font-mono">{cliente.ordenesCount}</span>,
      className: "text-right",
    },
    {
      header: "Saldo",
      cell: (cliente) =>
        cliente.saldo > 0 ? (
          <span className="font-mono font-medium text-[oklch(0.5_0.2_27)]">{formatoMoneda.format(cliente.saldo)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      className: "text-right",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Buscar por nombre, documento o teléfono..."
        value={busqueda}
        onChange={(event) => {
          setBusqueda(event.target.value);
          setPagina(1);
        }}
        className="max-w-sm"
        aria-label="Buscar clientes"
      />

      <DataTable
        columns={COLUMNS}
        rows={visibles}
        getRowKey={(cliente) => cliente.id}
        rowHref={(cliente) => `/clientes/${cliente.id}`}
        emptyMessage={
          clientes.length === 0
            ? "No hay clientes registrados."
            : "Ningún cliente coincide con la búsqueda."
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Mostrando {visibles.length} de {filtrados.length} clientes
        </span>
        {totalPaginas > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={paginaActual <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <span className={cn("font-mono text-xs")}>
              {paginaActual}/{totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={paginaActual >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            >
              Siguiente
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
