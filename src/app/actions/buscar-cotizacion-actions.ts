"use server";

import { requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { roundMoney } from "@/lib/money/round";
import { scopeRepuesto } from "@/lib/sede/scope";
import type { Prisma } from "@/generated/prisma-tenant";

export interface ResultadoKitBusqueda {
  id: string;
  nombre: string;
  /** Líneas que agrega: la mano de obra (si tiene precio) más un repuesto por línea del kit. */
  conceptos: number;
  /** Mano de obra + repuestos de la sede activa a precio de venta actual. */
  total: number;
  /** Repuestos del kit cuya bodega no cubre la cantidad del kit. */
  repuestosSinExistencia: number;
}

export interface ResultadoRepuestoBusqueda {
  id: string;
  codigo: string;
  nombre: string;
  precioVenta: number;
  stockActual: number;
  bodega: string;
}

export interface ResultadosBusquedaCotizacion {
  kits: ResultadoKitBusqueda[];
  repuestos: ResultadoRepuestoBusqueda[];
}

const MAX_KITS = 5;
const MAX_REPUESTOS = 8;

/** Cada palabra debe aparecer en alguno de los campos: "aceite 20w" encuentra "Aceite 20W50 Mobil". */
function filtroPorPalabras(q: string, campos: string[]) {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra) => ({ OR: campos.map((campo) => ({ [campo]: { contains: palabra, mode: "insensitive" } })) }));
}

/**
 * Lo que ofrece el buscador de la tabla de la cotización: servicios y kits
 * activos (con su kit limitado a la sede activa, igual que al aplicarlos) y
 * repuestos de la sede con su existencia. Sin texto solo sugiere servicios.
 */
export async function buscarParaCotizacionAction(texto: string): Promise<ResultadosBusquedaCotizacion> {
  const session = await requirePermiso("cotizaciones.editarItems");
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const q = (typeof texto === "string" ? texto : "").trim().slice(0, 80);
  const sedeActivaId = session.user.sedeActivaId;

  const [servicios, repuestos] = await Promise.all([
    tenantDb.servicio.findMany({
      where: {
        activo: true,
        AND: filtroPorPalabras(q, ["nombre"]) as Prisma.ServicioWhereInput[],
      },
      orderBy: { nombre: "asc" },
      take: MAX_KITS,
      select: {
        id: true,
        nombre: true,
        precioManoObra: true,
        repuestos: {
          where: { repuesto: scopeRepuesto(sedeActivaId) },
          select: { cantidad: true, repuesto: { select: { precioVenta: true, stockActual: true } } },
        },
      },
    }),
    q === ""
      ? Promise.resolve([])
      : tenantDb.repuesto.findMany({
          where: {
            ...scopeRepuesto(sedeActivaId),
            AND: filtroPorPalabras(q, ["nombre", "codigo"]) as Prisma.RepuestoWhereInput[],
          },
          orderBy: { nombre: "asc" },
          take: MAX_REPUESTOS,
          select: {
            id: true,
            codigo: true,
            nombre: true,
            precioVenta: true,
            stockActual: true,
            bodega: { select: { nombre: true } },
          },
        }),
  ]);

  const kits = servicios
    .map((servicio) => {
      const manoDeObra = Number(servicio.precioManoObra);
      const conceptos = (manoDeObra > 0 ? 1 : 0) + servicio.repuestos.length;
      return {
        id: servicio.id,
        nombre: servicio.nombre,
        conceptos,
        total: roundMoney(
          manoDeObra +
            servicio.repuestos.reduce((suma, linea) => suma + linea.cantidad * Number(linea.repuesto.precioVenta), 0),
        ),
        repuestosSinExistencia: servicio.repuestos.filter((linea) => linea.repuesto.stockActual < linea.cantidad).length,
      };
    })
    // Igual que al aplicar: un servicio sin nada que aportar en esta sede no se ofrece.
    .filter((kit) => kit.conceptos > 0);

  return {
    kits,
    repuestos: repuestos.map((repuesto) => ({
      id: repuesto.id,
      codigo: repuesto.codigo,
      nombre: repuesto.nombre,
      precioVenta: Number(repuesto.precioVenta),
      stockActual: repuesto.stockActual,
      bodega: repuesto.bodega.nombre,
    })),
  };
}
