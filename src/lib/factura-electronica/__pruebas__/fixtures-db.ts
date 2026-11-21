// src/lib/factura-electronica/__pruebas__/fixtures-db.ts
// Solo para pruebas del proyecto "db": arma la cadena mínima usuario → cliente → vehículo → orden → factura.
import type { TenantPrismaClient } from "@/lib/db/tenant-client";
import { computeFacturaTotales } from "@/lib/factura/totales";

export interface FacturaDePrueba {
  facturaId: string;
  usuarioId: string;
  clienteId: string;
}

/** Una línea de mano de obra de `valor` pesos (IVA 19 % incluido). La placa debe ser única. */
export async function crearFacturaDePrueba(
  db: TenantPrismaClient,
  placa: string,
  opciones: { valor?: number; descuento?: number } = {},
): Promise<FacturaDePrueba> {
  const valor = opciones.valor ?? 119000;
  const descuento = opciones.descuento ?? 0;
  const sede = await db.sede.findFirstOrThrow();
  const usuario = await db.usuario.upsert({
    where: { email: "fe-pruebas@torqueflow.test" },
    update: {},
    create: { email: "fe-pruebas@torqueflow.test", passwordHash: "sin-uso", nombre: "Pruebas FE", role: "ADMIN" },
  });
  const cliente = await db.cliente.create({ data: { nombre: `Cliente ${placa}` } });
  const vehiculo = await db.vehiculo.create({ data: { placa, marca: "Renault", modelo: "Logan", clienteId: cliente.id } });
  const orden = await db.ordenTrabajo.create({
    data: {
      estado: "TERMINADA",
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      sedeId: sede.id,
      creadoPorId: usuario.id,
      manoDeObra: { create: [{ descripcion: "Cambio de aceite", valor, ivaPct: 19 }] },
    },
  });
  const t = computeFacturaTotales({ items: [], manoDeObra: [{ valor, ivaPct: 19 }], descuento });
  const factura = await db.factura.create({
    data: {
      ordenId: orden.id,
      clienteId: cliente.id,
      subtotal: t.subtotal,
      descuento,
      iva: t.iva,
      desgloseIva: t.desgloseIva.map((tramo) => ({ ...tramo })),
      total: t.total,
      saldoPendiente: t.total,
      emitidaPorId: usuario.id,
    },
  });
  return { facturaId: factura.id, usuarioId: usuario.id, clienteId: cliente.id };
}
