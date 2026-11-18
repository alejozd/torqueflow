"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { NuevoRepuestoDialog } from "@/app/(dashboard)/repuestos/nuevo-repuesto-dialog";
import type { ResultadoConcepto } from "./tabla-conceptos";

/** Lo que necesita el diálogo de repuesto nuevo; null si quien captura no puede crear repuestos. */
export interface DatosCrearRepuesto {
  bodegas: Bodega[];
  proveedores: Proveedor[];
  verCostos: boolean;
}

/**
 * "Crear «…» en el inventario" desde el buscador de conceptos: abre el diálogo
 * de repuesto nuevo con el nombre buscado y, al guardarlo, lo agrega al
 * documento (cotización u orden) con `agregar`. Sin `datos` no ofrece nada.
 */
export function useCrearRepuesto(
  datos: DatosCrearRepuesto | null,
  agregar: (repuestoId: string) => Promise<ResultadoConcepto>,
): { abrir: ((descripcion: string) => void) | undefined; dialogo: ReactNode } {
  const router = useRouter();
  const [descripcion, setDescripcion] = useState<string | null>(null);

  if (!datos) return { abrir: undefined, dialogo: null };

  return {
    abrir: (texto) => setDescripcion(texto),
    dialogo: (
      <NuevoRepuestoDialog
        open={descripcion !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setDescripcion(null);
        }}
        nombreInicial={descripcion ?? ""}
        bodegas={datos.bodegas}
        proveedores={datos.proveedores}
        verCostos={datos.verCostos}
        onCreated={async (repuestoId) => {
          setDescripcion(null);
          try {
            const resultado = await agregar(repuestoId);
            if (resultado.error) toast.error(resultado.error);
            else toast.success("Repuesto creado y agregado");
          } catch {
            toast.error("El repuesto se creó, pero no se pudo agregar");
          }
          router.refresh();
        }}
      />
    ),
  };
}
