"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { NuevoVehiculoForm } from "../clientes/[id]/nuevo-vehiculo-form";
import { NuevoClienteForm } from "../clientes/nuevo-cliente-form";
import type { ClienteParaOrden } from "@/app/actions/cliente-actions";
import type { MarcaVehiculo, ModeloVehiculo } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KPI_TONE } from "@/components/ui/kpi-card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Cliente->vehículo cascading picker for the "Nueva orden" flow, plus the
 * escape hatches the plain cascading select didn't have: a cliente with zero
 * vehículos used to be a dead end (a static "no tiene vehículos" line and
 * nothing else) -- this lets staff create the vehículo (or the cliente
 * itself) right there and continue the same orden without losing context.
 */
export function ClientVehicleSelector({
  clientes,
  onClientesChange,
  clienteId,
  vehiculoId,
  onClienteIdChange,
  onVehiculoIdChange,
  clienteError,
  vehiculoError,
  marcas,
  modelos,
  esAdmin,
}: {
  clientes: ClienteParaOrden[];
  /** Applied by the caller (owns the list) whenever a create-dialog below adds a cliente/vehículo. */
  onClientesChange: (updater: (prev: ClienteParaOrden[]) => ClienteParaOrden[]) => void;
  clienteId: string;
  vehiculoId: string;
  onClienteIdChange: (id: string) => void;
  onVehiculoIdChange: (id: string) => void;
  clienteError?: string;
  vehiculoError?: string;
  marcas: MarcaVehiculo[];
  modelos: ModeloVehiculo[];
  esAdmin: boolean;
}) {
  const [crearClienteOpen, setCrearClienteOpen] = useState(false);
  const [crearVehiculoOpen, setCrearVehiculoOpen] = useState(false);

  const clientesPorId = useMemo(() => new Map(clientes.map((cliente) => [cliente.id, cliente])), [clientes]);
  const clienteSeleccionado = clientesPorId.get(clienteId) ?? null;
  const vehiculosDisponibles = clienteSeleccionado?.vehiculos ?? [];

  const clienteOptions: ComboboxOption[] = useMemo(
    () => clientes.map((cliente) => ({ value: cliente.id, label: cliente.nombre })),
    [clientes],
  );
  const vehiculoOptions: ComboboxOption[] = useMemo(
    () =>
      vehiculosDisponibles.map((vehiculo) => ({
        value: vehiculo.id,
        label: `${vehiculo.placa} · ${vehiculo.marca} ${vehiculo.modelo}`,
      })),
    [vehiculosDisponibles],
  );

  function seleccionarCliente(id: string) {
    onClienteIdChange(id);
    // A vehículo selected under the previous cliente must not survive the
    // switch -- it would silently point at another client's car.
    onVehiculoIdChange("");
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clienteId">Cliente</Label>
        <div className="flex items-center gap-1.5">
          {/*
            Combobox's Root renders as a plain block element -- it fills a
            column parent's width by default, but as a flex-row sibling of
            the "crear cliente" button it wouldn't grow past its own content
            (flex items don't stretch along the main axis without
            flex-grow). This wrapper is the one that actually grows.
          */}
          <div className="min-w-0 flex-1">
            <Combobox
              id="clienteId"
              items={clienteOptions}
              value={clienteId}
              onValueChange={seleccionarCliente}
              placeholder="Buscar cliente..."
              emptyMessage="Ningún cliente coincide"
              aria-invalid={clienteError ? true : undefined}
              aria-describedby={clienteError ? "clienteId-error" : undefined}
              renderOption={(item) => {
                const count = clientesPorId.get(item.value)?.vehiculos.length ?? 0;
                return (
                  <span className="flex w-full min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 truncate" title={item.label}>
                      {item.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        count === 0 ? KPI_TONE.warning.icon : "text-muted-foreground",
                      )}
                    >
                      {count === 0 ? "Sin vehículos" : `${count} vehículo${count === 1 ? "" : "s"}`}
                    </span>
                  </span>
                );
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            title="Crear cliente nuevo"
            onClick={() => setCrearClienteOpen(true)}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        {clienteError ? (
          <p id="clienteId-error" className="text-xs text-destructive">
            {clienteError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vehiculoId">Vehículo</Label>
        <Combobox
          id="vehiculoId"
          disabled={!clienteId}
          items={vehiculoOptions}
          value={vehiculoId}
          onValueChange={onVehiculoIdChange}
          placeholder={clienteId ? "Buscar vehículo..." : "Primero selecciona un cliente"}
          emptyMessage="Ningún vehículo coincide"
          aria-invalid={vehiculoError ? true : undefined}
          aria-describedby={vehiculoError ? "vehiculoId-error" : undefined}
        />
        {vehiculoError ? (
          <p id="vehiculoId-error" className="text-xs text-destructive">
            {vehiculoError}
          </p>
        ) : null}
      </div>

      {clienteSeleccionado && vehiculosDisponibles.length === 0 ? (
        <Alert className={cn("sm:col-span-2", KPI_TONE.warning.cardBg)}>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span className={KPI_TONE.warning.icon}>{clienteSeleccionado.nombre} no tiene vehículos registrados</span>
            <Button type="button" size="sm" onClick={() => setCrearVehiculoOpen(true)}>
              <Plus className="size-3.5" />
              Crear vehículo para este cliente
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Dialog open={crearClienteOpen} onOpenChange={setCrearClienteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
            <DialogDescription>Queda disponible de inmediato para esta orden.</DialogDescription>
          </DialogHeader>
          <NuevoClienteForm
            onCreated={(cliente) => {
              onClientesChange((prev) => [...prev, { id: cliente.id, nombre: cliente.nombre, vehiculos: [] }]);
              seleccionarCliente(cliente.id);
              setCrearClienteOpen(false);
              // The fresh cliente is guaranteed to have zero vehículos --
              // continue straight into "Crear vehículo" instead of leaving
              // the user back at a selector that would just tell them so.
              setCrearVehiculoOpen(true);
            }}
          />
        </DialogContent>
      </Dialog>

      {clienteSeleccionado ? (
        <Dialog open={crearVehiculoOpen} onOpenChange={setCrearVehiculoOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Nuevo vehículo · {clienteSeleccionado.nombre}</DialogTitle>
              <DialogDescription>
                Queda asociado a este cliente y disponible de inmediato para esta orden.
              </DialogDescription>
            </DialogHeader>
            <NuevoVehiculoForm
              clienteId={clienteSeleccionado.id}
              marcas={marcas}
              modelos={modelos}
              esAdmin={esAdmin}
              onCreated={(vehiculo) => {
                onClientesChange((prev) =>
                  prev.map((cliente) =>
                    cliente.id === clienteSeleccionado.id
                      ? {
                          ...cliente,
                          vehiculos: [
                            ...cliente.vehiculos,
                            {
                              id: vehiculo.id,
                              placa: vehiculo.placa,
                              marca: vehiculo.marca,
                              modelo: vehiculo.modelo,
                              kilometrajeActual: vehiculo.kilometraje,
                            },
                          ],
                        }
                      : cliente,
                  ),
                );
                onVehiculoIdChange(vehiculo.id);
                setCrearVehiculoOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
