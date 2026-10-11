"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  actualizarCantidadRepuestoServicioAction,
  agregarRepuestoAServicioAction,
  quitarRepuestoDeServicioAction,
  type ServicioRepuestoFormState,
  type ServicioRepuestoVista,
  type ServicioVista,
} from "@/app/actions/servicio-actions";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import { roundMoney } from "@/lib/money/round";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });
const initialState: ServicioRepuestoFormState = { error: null, success: false, cantidad: null };

function FilaKit({ servicioId, linea }: { servicioId: string; linea: ServicioRepuestoVista }) {
  const [cantidad, setCantidad] = useState(String(linea.cantidad));
  const [confirmando, setConfirmando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const subtotal = roundMoney(Number(cantidad) * linea.precioVenta);
  const cambio = Number(cantidad) !== linea.cantidad;

  function guardarCantidad() {
    startTransition(async () => {
      try {
        const result = await actualizarCantidadRepuestoServicioAction(servicioId, linea.repuestoId, Number(cantidad));
        if (result.error) toast.error(result.error);
        else toast.success("Cantidad actualizada");
      } catch {
        toast.error("No se pudo actualizar la cantidad");
      }
    });
  }

  function quitar() {
    startTransition(async () => {
      try {
        const result = await quitarRepuestoDeServicioAction(servicioId, linea.repuestoId);
        if (result.error) toast.error(result.error);
        else toast.success("Repuesto quitado del kit");
      } catch {
        toast.error("No se pudo quitar el repuesto del kit");
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{linea.codigo}</TableCell>
      <TableCell>{linea.nombre}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="1"
            max="1000"
            step="1"
            className="w-20 font-mono"
            aria-label={`Cantidad de ${linea.nombre}`}
            value={cantidad}
            onChange={(evento) => setCantidad(evento.target.value)}
          />
          {cambio ? (
            <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={guardarCantidad}>
              Guardar
            </Button>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-xs">{formatoMoneda.format(linea.precioVenta)}</TableCell>
      <TableCell className="text-right font-mono text-xs">{formatoMoneda.format(subtotal)}</TableCell>
      <TableCell className="text-right">
        {confirmando ? (
          <ConfirmacionEnLinea
            pregunta="¿Quitar del kit?"
            etiquetaConfirmar="Quitar"
            pendiente={isPending}
            onCancelar={() => setConfirmando(false)}
            onConfirmar={quitar}
          />
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmando(true)}>
            Quitar
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Repuestos del kit de un servicio. Solo ofrece repuestos de la sede activa
 * (la lista llega ya filtrada por `listRepuestoOptions`), igual que la action
 * los vuelve a validar del lado del servidor (D10).
 */
export function KitRepuestosEditor({
  servicio,
  repuestos,
}: {
  servicio: ServicioVista;
  repuestos: RepuestoOption[];
}) {
  const [repuestoId, setRepuestoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const opciones: ComboboxOption[] = repuestos.map((repuesto) => ({
    value: repuesto.id,
    label: `${repuesto.codigo} — ${repuesto.nombre}`,
  }));

  function agregar() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("repuestoId", repuestoId);
        formData.set("cantidad", cantidad);

        const result = await agregarRepuestoAServicioAction(servicio.id, initialState, formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        setError(null);
        setRepuestoId("");
        setCantidad("1");
        toast.success(
          result.cantidad === 1 ? "Repuesto en el kit: 1 unidad" : `Repuesto en el kit: ${result.cantidad} unidades`,
        );
      } catch {
        toast.error("No se pudo agregar el repuesto al kit");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {servicio.repuestos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Este servicio todavía no tiene repuestos: es mano de obra suelta. Agrega repuestos para convertirlo en kit.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Repuesto</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead className="text-right">Precio de venta</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {servicio.repuestos.map((linea) => (
              <FilaKit key={linea.repuestoId} servicioId={servicio.id} linea={linea} />
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-col gap-2 rounded-md border p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`servicio-${servicio.id}-repuesto`}>Agregar repuesto de tu sede</Label>
            <Combobox
              id={`servicio-${servicio.id}-repuesto`}
              items={opciones}
              value={repuestoId}
              onValueChange={setRepuestoId}
              placeholder="Buscar repuesto por código o nombre"
              emptyMessage="Ningún repuesto coincide en esta sede"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`servicio-${servicio.id}-cantidad`}>Cantidad</Label>
            <Input
              id={`servicio-${servicio.id}-cantidad`}
              type="number"
              min="1"
              max="1000"
              step="1"
              className="font-mono"
              value={cantidad}
              onChange={(evento) => setCantidad(evento.target.value)}
            />
          </div>
          <Button type="button" disabled={isPending} onClick={agregar}>
            {isPending ? "Agregando..." : "Agregar al kit"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          El precio no se guarda en el kit: al aplicar el servicio se toma el precio de venta actual del repuesto. Si el
          repuesto ya está en el kit, se suma la cantidad.
        </p>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
