"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Phone, Wrench } from "lucide-react";
import type { FilaVencimiento } from "@/app/actions/vencimiento-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { PlacaVehiculo } from "@/components/placa-vehiculo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { VencimientoBadge } from "@/components/vencimiento-badge";
import { formatoFechaRelativa } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";
import type { EstadoVencimiento } from "@/lib/vencimientos/estado-vencimiento";
import {
  contarPorFiltro,
  ETIQUETA_FILTRO_RAPIDO,
  FILTROS_RAPIDOS,
  filtrarVencimientos,
  type FiltroDocumento,
  type FiltroRapido,
} from "@/lib/vencimientos/filtro-lista";
import { ETIQUETA_TIPO_VEHICULO } from "@/lib/validation/vehiculo";
import { AvisarWhatsappButton } from "./avisar-whatsapp-button";

function textoDias(dias: number): string {
  if (dias < 0) return `Hace ${-dias} ${dias === -1 ? "día" : "días"}`;
  if (dias === 0) return "Hoy";
  return `En ${dias} ${dias === 1 ? "día" : "días"}`;
}

// Mismos tonos que VencimientoBadge, para que la fila hable un solo idioma de color.
const TONO_ESTADO: Record<EstadoVencimiento, string> = {
  SIN_DATO: "bg-muted text-muted-foreground",
  VIGENTE: "bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  POR_VENCER: "bg-[oklch(0.7_0.15_85/0.15)] text-[oklch(0.5_0.12_85)]",
  PROXIMO: "bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  VENCIDO: "bg-[oklch(0.5_0.2_27/0.1)] text-[oklch(0.5_0.2_27)]",
};

// Días: POR_VENCER va en gris (el color lo reservan los casos urgentes).
const TONO_DIAS: Record<EstadoVencimiento, string> = {
  ...TONO_ESTADO,
  POR_VENCER: "bg-muted text-muted-foreground",
};

const TONO_CHIP: Record<FiltroRapido, { suave: string; anillo: string }> = {
  TODOS: { suave: "bg-muted text-foreground", anillo: "ring-2 ring-foreground bg-foreground text-background" },
  VENCIDO: { suave: TONO_ESTADO.VENCIDO, anillo: "ring-2 ring-[oklch(0.5_0.2_27)]" },
  PROXIMO: { suave: TONO_ESTADO.PROXIMO, anillo: "ring-2 ring-[oklch(0.55_0.15_60)]" },
  POR_VENCER: { suave: "bg-[oklch(0.6_0.12_250/0.12)] text-[oklch(0.45_0.15_250)]", anillo: "ring-2 ring-[oklch(0.45_0.15_250)]" },
  SIN_AVISAR: { suave: "bg-muted text-muted-foreground", anillo: "ring-2 ring-neutral-400" },
};

const TEXTO_AVISO = (fila: FilaVencimiento, ahora: Date) =>
  fila.ultimoAviso
    ? `${fila.ultimoAviso.canal === "EMAIL" ? "Email" : "WhatsApp"} · ${formatoFechaRelativa(fila.ultimoAviso.enviadoAt, ahora)}`
    : null;

export function VencimientosTable({
  filas,
  puedeAvisar,
  ahora,
}: {
  filas: FilaVencimiento[];
  puedeAvisar: boolean;
  /** Creado una vez en el servidor: SSR e hidratación comparten el mismo instante. */
  ahora: Date;
}) {
  const [documento, setDocumento] = useState<FiltroDocumento>("TODOS");
  const [rapido, setRapido] = useState<FiltroRapido>("TODOS");

  const visibles = filtrarVencimientos(filas, documento, rapido);
  const conteos = contarPorFiltro(filas, documento);

  const columns: DataTableColumn<FilaVencimiento>[] = [
    {
      header: "Vehículo",
      cell: (fila) => (
        <Link href={`/vehiculos/${fila.vehiculoId}`} className="group flex items-center gap-3">
          <PlacaVehiculo as="span" placa={fila.placa} className="text-sm" />
          <span className="flex flex-col">
            <span className="font-medium group-hover:underline">
              {fila.marca} {fila.modelo}
            </span>
            <span className="text-xs text-muted-foreground">
              {ETIQUETA_TIPO_VEHICULO[fila.tipoVehiculo]}
              {fila.anio ? ` · ${fila.anio}` : ""}
            </span>
          </span>
        </Link>
      ),
      searchValue: (fila) => `${fila.placa} ${fila.marca} ${fila.modelo}`,
    },
    {
      header: "Cliente",
      cell: (fila) => (
        <div className="flex flex-col">
          <span>{fila.clienteNombre}</span>
          {fila.clienteTelefono ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="size-3" />
              {fila.clienteTelefono}
            </span>
          ) : null}
        </div>
      ),
      searchValue: (fila) => `${fila.clienteNombre} ${fila.clienteTelefono ?? ""}`,
    },
    {
      header: "Documento",
      cell: (fila) =>
        fila.tipo === "SOAT" ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[oklch(0.6_0.12_250/0.12)] px-2 py-0.5 text-xs font-medium text-[oklch(0.45_0.15_250)]">
            <FileText className="size-3.5" />
            SOAT
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[oklch(0.55_0.18_300/0.12)] px-2 py-0.5 text-xs font-medium text-[oklch(0.45_0.18_300)]">
            <Wrench className="size-3.5" />
            Tecnomecánica
          </span>
        ),
    },
    {
      header: "Vencimiento",
      cell: (fila) => <VencimientoBadge estado={fila.estado} fecha={fila.fechaVencimiento} />,
    },
    {
      header: "Días",
      cell: (fila) => (
        <span className={cn("inline-block rounded-md px-2 py-0.5 font-mono text-xs", TONO_DIAS[fila.estado])}>
          {textoDias(fila.diasRestantes)}
        </span>
      ),
    },
  ];
  if (puedeAvisar) {
    columns.push({
      header: "Aviso",
      cell: (fila) => {
        const texto = TEXTO_AVISO(fila, ahora);
        return (
          <div className="flex flex-col items-start gap-1">
            <AvisarWhatsappButton vehiculoId={fila.vehiculoId} tipo={fila.tipo} urlWhatsapp={fila.urlWhatsapp} />
            <span className="text-xs text-muted-foreground">
              {texto ? `Avisado por ${texto}` : "Sin avisar"}
            </span>
          </div>
        );
      },
    });
  } else {
    columns.push({ header: "Último aviso", cell: (fila) => TEXTO_AVISO(fila, ahora) ?? "—" });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Listado de vencimientos</CardTitle>
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {visibles.length} en el filtro
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SelectField
            className="w-44"
            value={documento}
            onValueChange={(valor) => setDocumento(valor as FiltroDocumento)}
            items={[
              { value: "TODOS", label: "Todos los documentos" },
              { value: "SOAT", label: "SOAT" },
              { value: "TECNOMECANICA", label: "Tecnomecánica" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtros rápidos:</span>
          <div role="group" aria-label="Filtros rápidos" className="flex flex-wrap items-center gap-2">
          {FILTROS_RAPIDOS.map((filtro) => {
            const activo = rapido === filtro;
            return (
              <button
                key={filtro}
                type="button"
                aria-pressed={activo}
                onClick={() => setRapido(filtro)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-shadow",
                  TONO_CHIP[filtro].suave,
                  activo && TONO_CHIP[filtro].anillo,
                )}
              >
                {ETIQUETA_FILTRO_RAPIDO[filtro]} ({conteos[filtro]})
              </button>
            );
          })}
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={visibles}
          getRowKey={(fila) => fila.id}
          emptyMessage="No hay vencimientos con este filtro."
          searchable
          searchPlaceholder="Buscar por placa, vehículo, cliente o teléfono…"
        />
      </CardContent>
    </Card>
  );
}
