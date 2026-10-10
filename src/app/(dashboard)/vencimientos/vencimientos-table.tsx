"use client";

import { useState } from "react";
import Link from "next/link";
import type { FilaVencimiento } from "@/app/actions/vencimiento-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { VencimientoBadge } from "@/components/vencimiento-badge";
import { formatoFechaRelativa } from "@/lib/fecha-bogota";
import { ETIQUETA_TIPO_VEHICULO } from "@/lib/validation/vehiculo";
import { AvisarWhatsappButton } from "./avisar-whatsapp-button";

const NOMBRE_TIPO_DOCUMENTO = { SOAT: "SOAT", TECNOMECANICA: "Tecnomecánica" } as const;

function textoDias(dias: number): string {
  if (dias < 0) return `Hace ${-dias} ${dias === -1 ? "día" : "días"}`;
  if (dias === 0) return "Hoy";
  return `En ${dias} ${dias === 1 ? "día" : "días"}`;
}

export function VencimientosTable({ filas, puedeAvisar }: { filas: FilaVencimiento[]; puedeAvisar: boolean }) {
  const [documento, setDocumento] = useState("TODOS");
  const [estado, setEstado] = useState("TODOS");
  const [soloSinAvisar, setSoloSinAvisar] = useState(false);
  // Fixed once per mount so every "Último aviso" cell is relative to the same instant.
  const [ahora] = useState(() => new Date());

  const visibles = filas.filter((fila) => {
    if (documento !== "TODOS" && fila.tipo !== documento) return false;
    if (estado === "VENCIDO" && fila.estado !== "VENCIDO") return false;
    if (estado === "POR_VENCER" && fila.estado === "VENCIDO") return false;
    if (soloSinAvisar && fila.ultimoAviso !== null) return false;
    return true;
  });

  const columns: DataTableColumn<FilaVencimiento>[] = [
    {
      header: "Placa",
      cell: (fila) => (
        <Link href={`/vehiculos/${fila.vehiculoId}`} className="font-mono hover:underline">
          {fila.placa}
        </Link>
      ),
      searchValue: (fila) => fila.placa,
    },
    { header: "Tipo", cell: (fila) => ETIQUETA_TIPO_VEHICULO[fila.tipoVehiculo] },
    { header: "Cliente", cell: (fila) => fila.clienteNombre, searchValue: (fila) => fila.clienteNombre },
    { header: "Documento", cell: (fila) => NOMBRE_TIPO_DOCUMENTO[fila.tipo] },
    { header: "Vence", cell: (fila) => <VencimientoBadge estado={fila.estado} fecha={fila.fechaVencimiento} /> },
    { header: "Días", cell: (fila) => textoDias(fila.diasRestantes) },
    {
      header: "Último aviso",
      cell: (fila) =>
        fila.ultimoAviso
          ? `${fila.ultimoAviso.canal === "EMAIL" ? "Email" : "WhatsApp"} · ${formatoFechaRelativa(fila.ultimoAviso.enviadoAt, ahora)}`
          : "—",
    },
  ];
  if (puedeAvisar) {
    columns.push({
      header: "Acciones",
      cell: (fila) => (
        <AvisarWhatsappButton vehiculoId={fila.vehiculoId} tipo={fila.tipo} urlWhatsapp={fila.urlWhatsapp} />
      ),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Listado</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SelectField
            className="w-44"
            value={documento}
            onValueChange={setDocumento}
            items={[
              { value: "TODOS", label: "Todos los documentos" },
              { value: "SOAT", label: "SOAT" },
              { value: "TECNOMECANICA", label: "Tecnomecánica" },
            ]}
          />
          <SelectField
            className="w-44"
            value={estado}
            onValueChange={setEstado}
            items={[
              { value: "TODOS", label: "Todos los estados" },
              { value: "VENCIDO", label: "Vencidos" },
              { value: "POR_VENCER", label: "Por vencer" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={soloSinAvisar}
              onChange={(event) => setSoloSinAvisar(event.target.checked)}
            />
            Solo sin avisar
          </label>
        </div>
        <DataTable
          columns={columns}
          rows={visibles}
          getRowKey={(fila) => fila.id}
          emptyMessage="No hay vencimientos en los próximos días."
          searchable
          searchPlaceholder="Buscar por placa o cliente..."
        />
      </CardContent>
    </Card>
  );
}
