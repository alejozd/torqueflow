"use client";

import { useEffect, useState } from "react";
import { listTarifasIva } from "@/app/actions/tarifa-iva-actions";
import { IVA_PREDETERMINADO_RESPALDO, textoPorcentaje, type TarifaIvaVista } from "@/lib/iva/tarifas";
import { SelectField } from "@/components/ui/select-field";

// Una sola consulta por carga de página, compartida por todos los selectores
// (una cotización puede tener muchas líneas). Si falla se reintenta la próxima vez.
let cache: Promise<TarifaIvaVista[]> | null = null;
function cargarTarifas(): Promise<TarifaIvaVista[]> {
  cache ??= listTarifasIva().catch((err) => {
    cache = null;
    throw err;
  });
  return cache;
}

/** Tarifas del taller, cargadas una vez; `null` mientras llegan. */
export function useTarifasIva(): TarifaIvaVista[] | null {
  const [tarifas, setTarifas] = useState<TarifaIvaVista[] | null>(null);
  useEffect(() => {
    let vigente = true;
    cargarTarifas()
      .then((lista) => vigente && setTarifas(lista))
      .catch(() => vigente && setTarifas([]));
    return () => {
      vigente = false;
    };
  }, []);
  return tarifas;
}

export function porcentajePredeterminado(tarifas: TarifaIvaVista[] | null): number {
  return tarifas?.find((t) => t.predeterminada && t.activa)?.porcentaje ?? IVA_PREDETERMINADO_RESPALDO;
}

/**
 * Selector de tarifa de IVA. Ofrece las tarifas activas y, si el valor actual
 * es de una tarifa desactivada, lo muestra igual (marcado) para no cambiarlo
 * sin querer. Sin `value` arranca en la predeterminada.
 *
 * - Controlado: `value` + `onChange` (líneas de cotización, orden, mostrador).
 * - Dentro de un <form>: `name` (+ `defaultValue`) y viaja en el FormData.
 */
export function SelectorIva({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  size,
  className,
}: {
  id?: string;
  name?: string;
  value?: number;
  defaultValue?: number;
  onChange?: (porcentaje: number) => void;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  const tarifas = useTarifasIva();
  const [interno, setInterno] = useState<number | undefined>(defaultValue);
  const elegido = value ?? interno ?? (tarifas ? porcentajePredeterminado(tarifas) : undefined);

  const items = (tarifas ?? [])
    .filter((t) => t.activa)
    .map((t) => ({ value: String(t.porcentaje), label: `${textoPorcentaje(t.porcentaje)} · ${t.nombre}` }));
  if (elegido !== undefined && !items.some((item) => Number(item.value) === elegido)) {
    const inactiva = tarifas?.find((t) => t.porcentaje === elegido);
    items.push({ value: String(elegido), label: `${textoPorcentaje(elegido)}${inactiva ? ` · ${inactiva.nombre}` : ""} (inactiva)` });
  }

  return (
    <SelectField
      id={id}
      name={name}
      size={size}
      className={className}
      disabled={disabled || tarifas === null}
      placeholder={tarifas === null ? "Cargando…" : "IVA"}
      items={items}
      value={elegido === undefined ? "" : String(elegido)}
      onValueChange={(nuevo) => {
        const numero = Number(nuevo);
        if (!Number.isFinite(numero)) return;
        setInterno(numero);
        onChange?.(numero);
      }}
    />
  );
}
