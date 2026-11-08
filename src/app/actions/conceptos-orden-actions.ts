"use server";

import { revalidatePath } from "next/cache";
import { puede, requirePermiso } from "@/lib/auth/guards";
import { ROLES_MECANICO } from "@/lib/auth/permisos";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { buscarConceptos, type ResultadosBusquedaConceptos } from "@/lib/conceptos/buscar";
import { resolverIvaPct } from "@/lib/iva/resolver";
import { idConceptoOrden, leerIdConceptoOrden } from "@/lib/orden/conceptos-orden";
import { assertOrdenMutable } from "@/lib/orden/mutable-guard";
import type { ResultadoAccion } from "@/lib/resultado-accion";
import { scopeOrdenVisible, scopeRepuesto } from "@/lib/sede/scope";
import {
  cambiosConceptoOrdenSchema,
  libreOrdenInputSchema,
  type CambiosConceptoOrden,
  type LibreOrdenInput,
} from "@/lib/validation/orden";
import type { ResultadoConcepto } from "@/components/conceptos/tabla-conceptos";

/**
 * Acciones de la tabla de conceptos de la orden (la misma tabla de la
 * cotización). La orden guarda repuestos y mano de obra en tablas distintas;
 * el id de cada concepto dice en cuál está ("item:…" o "mo:…"). Se llaman
 * directo desde el cliente y responden con datos, nunca lanzando: Next oculta
 * los mensajes de error lanzados en producción.
 */

type TenantDb = ReturnType<typeof getTenantDb>;
type Sesion = Awaited<ReturnType<typeof requirePermiso>>;

const LINEA_NO_ESTA = "La línea ya no está en esta orden";

function sinConcepto(error: string): ResultadoConcepto {
  return { error, conceptoId: null };
}

/** La orden visible para quien edita y todavía modificable; trae su mecánico. */
async function ordenEditable(
  tenantDb: TenantDb,
  session: Sesion,
  ordenId: string,
): Promise<{ error: string } | { mecanicoId: string | null }> {
  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: {
      id: ordenId,
      ...scopeOrdenVisible(session.user.sedeActivaId, session.user.id, puede(session, "ordenes.verTodas")),
    },
    select: { estado: true, factura: { select: { id: true } }, mecanicoId: true },
  });
  if (!orden) return { error: "Orden no encontrada" };
  try {
    assertOrdenMutable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no modificable" };
  }
  return { mecanicoId: orden.mecanicoId };
}

/** El técnico, si es un mecánico de la sede activa; si no, null. */
async function mecanicoDeLaSede(tenantDb: TenantDb, mecanicoId: string | null, sedeId: string): Promise<string | null> {
  if (!mecanicoId) return null;
  const tecnico = await tenantDb.usuario.findFirst({
    where: { id: mecanicoId, role: { in: [...ROLES_MECANICO] }, sedes: { some: { sedeId } } },
    select: { id: true },
  });
  return tecnico?.id ?? null;
}

function revalidar(ordenId: string): void {
  revalidatePath(`/ordenes/${ordenId}`);
}

/** El buscador de la tabla de la orden: mismos resultados que la cotización, con el permiso de la orden. */
export async function buscarParaOrdenAction(texto: string): Promise<ResultadosBusquedaConceptos> {
  const session = await requirePermiso("ordenes.trabajar");
  return buscarConceptos(getTenantDb(session.user.tenantSchema), session.user.sedeActivaId, texto);
}

/**
 * Agrega un repuesto del inventario con cantidad 1, su precio de venta y su IVA.
 * Si ya está suelto en la orden (fuera de un kit), le suma 1 en vez de repetirlo.
 */
export async function agregarRepuestoAOrdenAction(ordenId: string, repuestoId: string): Promise<ResultadoConcepto> {
  const session = await requirePermiso("ordenes.trabajar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await ordenEditable(tenantDb, session, ordenId);
  if ("error" in orden) return sinConcepto(orden.error);

  const repuesto = await tenantDb.repuesto.findFirst({
    where: { id: repuestoId, ...scopeRepuesto(session.user.sedeActivaId) },
    select: { id: true, nombre: true, precioVenta: true, ivaPct: true },
  });
  if (!repuesto) return sinConcepto("Repuesto no encontrado");

  try {
    const suelto = await tenantDb.itemOrden.findFirst({
      where: { ordenId, repuestoId: repuesto.id, grupoKitId: null },
      select: { id: true },
    });
    let resultado: ResultadoConcepto;
    if (suelto) {
      await tenantDb.itemOrden.update({ where: { id: suelto.id }, data: { cantidad: { increment: 1 } } });
      resultado = { error: null, conceptoId: idConceptoOrden("item", suelto.id), fusionado: true };
    } else {
      const creado = await tenantDb.itemOrden.create({
        data: {
          ordenId,
          repuestoId: repuesto.id,
          descripcion: repuesto.nombre,
          cantidad: 1,
          precioUnitario: repuesto.precioVenta,
          ivaPct: repuesto.ivaPct,
        },
        select: { id: true },
      });
      resultado = { error: null, conceptoId: idConceptoOrden("item", creado.id), fusionado: false };
    }
    revalidar(ordenId);
    return resultado;
  } catch (err) {
    return sinConcepto(friendlyPrismaErrorMessage(err, "Error al agregar el repuesto"));
  }
}

/**
 * Agrega una línea fuera del catálogo con precio 0, lista para ponerle precio.
 * Lleva la tarifa de IVA predeterminada; la mano de obra, el mecánico de la orden.
 */
export async function agregarLibreAOrdenAction(ordenId: string, input: LibreOrdenInput): Promise<ResultadoConcepto> {
  const parsed = libreOrdenInputSchema.safeParse(input);
  if (!parsed.success) return sinConcepto(parsed.error.issues[0]?.message ?? "Datos inválidos");

  const session = await requirePermiso("ordenes.trabajar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await ordenEditable(tenantDb, session, ordenId);
  if ("error" in orden) return sinConcepto(orden.error);

  const iva = await resolverIvaPct(tenantDb, undefined);
  const ivaPct = iva.ok ? iva.ivaPct : undefined;

  try {
    let conceptoId: string;
    if (parsed.data.tipo === "REPUESTO") {
      const creado = await tenantDb.itemOrden.create({
        data: { ordenId, repuestoId: null, descripcion: parsed.data.descripcion, cantidad: 1, precioUnitario: 0, ivaPct },
        select: { id: true },
      });
      conceptoId = idConceptoOrden("item", creado.id);
    } else {
      const mecanicoId = await mecanicoDeLaSede(tenantDb, orden.mecanicoId, session.user.sedeActivaId);
      const creada = await tenantDb.manoDeObra.create({
        data: { ordenId, descripcion: parsed.data.descripcion, valor: 0, mecanicoId, ivaPct },
        select: { id: true },
      });
      conceptoId = idConceptoOrden("mo", creada.id);
    }
    revalidar(ordenId);
    return { error: null, conceptoId };
  } catch (err) {
    return sinConcepto(friendlyPrismaErrorMessage(err, "Error al agregar el ítem"));
  }
}

/**
 * Guarda una celda editada. Repuestos: cantidad (entera), precio, IVA y, si es
 * libre, descripción. Mano de obra: valor (la celda de precio), IVA, mecánico y,
 * si es libre, descripción.
 */
export async function actualizarConceptoOrdenAction(
  ordenId: string,
  conceptoId: string,
  cambios: CambiosConceptoOrden,
): Promise<ResultadoConcepto> {
  const parsed = cambiosConceptoOrdenSchema.safeParse(cambios);
  if (!parsed.success) return sinConcepto(parsed.error.issues[0]?.message ?? "Datos inválidos");
  const linea = leerIdConceptoOrden(conceptoId);
  if (!linea) return sinConcepto(LINEA_NO_ESTA);

  const session = await requirePermiso("ordenes.trabajar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await ordenEditable(tenantDb, session, ordenId);
  if ("error" in orden) return sinConcepto(orden.error);

  const { cantidad, precioUnitario, ivaPct, descripcion, mecanicoId } = parsed.data;

  const actual =
    linea.tabla === "item"
      ? await tenantDb.itemOrden.findFirst({
          where: { id: linea.id, ordenId },
          select: { id: true, repuestoId: true, grupoKitId: true, ivaPct: true },
        })
      : await tenantDb.manoDeObra.findFirst({
          where: { id: linea.id, ordenId },
          select: { id: true, grupoKitId: true, ivaPct: true },
        });
  if (!actual) return sinConcepto(LINEA_NO_ESTA);

  // Libre: fuera de un kit y, si es repuesto, sin repuesto del inventario.
  const esLibre = actual.grupoKitId === null && ("repuestoId" in actual ? actual.repuestoId === null : true);
  if (descripcion !== undefined && !esLibre) {
    return sinConcepto("Solo las líneas libres permiten cambiar la descripción");
  }
  if (linea.tabla === "mo" && cantidad !== undefined) {
    return sinConcepto("La mano de obra no tiene cantidad: cambia su valor");
  }
  if (linea.tabla === "item" && mecanicoId !== undefined) {
    return sinConcepto("Solo la mano de obra tiene mecánico");
  }

  const data: Record<string, unknown> = {};
  if (cantidad !== undefined) data.cantidad = cantidad;
  if (precioUnitario !== undefined) data[linea.tabla === "item" ? "precioUnitario" : "valor"] = precioUnitario;
  if (descripcion !== undefined) data.descripcion = descripcion;
  if (ivaPct !== undefined) {
    const iva = await resolverIvaPct(tenantDb, ivaPct, Number(actual.ivaPct));
    if (!iva.ok) return sinConcepto(iva.error);
    data.ivaPct = iva.ivaPct;
  }
  if (mecanicoId !== undefined) {
    if (mecanicoId === null) {
      data.mecanicoId = null;
    } else {
      const tecnico = await mecanicoDeLaSede(tenantDb, mecanicoId, session.user.sedeActivaId);
      if (!tecnico) return sinConcepto("El técnico seleccionado no existe o no pertenece a esta sede.");
      data.mecanicoId = tecnico;
    }
  }

  try {
    if (linea.tabla === "item") {
      await tenantDb.itemOrden.update({ where: { id: actual.id }, data });
    } else {
      await tenantDb.manoDeObra.update({ where: { id: actual.id }, data });
    }
  } catch (err) {
    return sinConcepto(friendlyPrismaErrorMessage(err, "Error al guardar el cambio"));
  }
  revalidar(ordenId);
  return { error: null, conceptoId };
}

/**
 * Pasa una línea libre de repuesto a mano de obra o al revés. Como viven en
 * tablas distintas, se borra en una y se crea en la otra en una sola
 * transacción, conservando descripción, importe, IVA, kit y fecha (para que no
 * cambie de lugar en la lista). A mano de obra lleva el mecánico de la orden.
 */
export async function cambiarTipoConceptoOrdenAction(ordenId: string, conceptoId: string): Promise<ResultadoConcepto> {
  const linea = leerIdConceptoOrden(conceptoId);
  if (!linea) return sinConcepto(LINEA_NO_ESTA);

  const session = await requirePermiso("ordenes.trabajar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await ordenEditable(tenantDb, session, ordenId);
  if ("error" in orden) return sinConcepto(orden.error);
  const SOLO_LIBRES = "Solo las líneas libres pueden cambiar entre repuesto y mano de obra";

  try {
    if (linea.tabla === "item") {
      const item = await tenantDb.itemOrden.findFirst({
        where: { id: linea.id, ordenId },
        select: {
          id: true,
          repuestoId: true,
          grupoKitId: true,
          grupoKitNombre: true,
          descripcion: true,
          cantidad: true,
          precioUnitario: true,
          ivaPct: true,
          createdAt: true,
        },
      });
      if (!item) return sinConcepto(LINEA_NO_ESTA);
      if (item.repuestoId !== null || item.grupoKitId !== null) return sinConcepto(SOLO_LIBRES);
      const mecanicoId = await mecanicoDeLaSede(tenantDb, orden.mecanicoId, session.user.sedeActivaId);
      const creada = await tenantDb.$transaction(async (tx) => {
        await tx.itemOrden.delete({ where: { id: item.id } });
        return tx.manoDeObra.create({
          data: {
            ordenId,
            descripcion: item.descripcion,
            valor: item.cantidad * Number(item.precioUnitario),
            ivaPct: item.ivaPct,
            mecanicoId,
            grupoKitId: item.grupoKitId,
            grupoKitNombre: item.grupoKitNombre,
            createdAt: item.createdAt,
          },
          select: { id: true },
        });
      });
      revalidar(ordenId);
      return { error: null, conceptoId: idConceptoOrden("mo", creada.id) };
    }

    const mano = await tenantDb.manoDeObra.findFirst({
      where: { id: linea.id, ordenId },
      select: {
        id: true,
        grupoKitId: true,
        grupoKitNombre: true,
        descripcion: true,
        valor: true,
        ivaPct: true,
        createdAt: true,
      },
    });
    if (!mano) return sinConcepto(LINEA_NO_ESTA);
    if (mano.grupoKitId !== null) return sinConcepto(SOLO_LIBRES);
    const creado = await tenantDb.$transaction(async (tx) => {
      await tx.manoDeObra.delete({ where: { id: mano.id } });
      return tx.itemOrden.create({
        data: {
          ordenId,
          repuestoId: null,
          descripcion: mano.descripcion,
          cantidad: 1,
          precioUnitario: mano.valor,
          ivaPct: mano.ivaPct,
          grupoKitId: mano.grupoKitId,
          grupoKitNombre: mano.grupoKitNombre,
          createdAt: mano.createdAt,
        },
        select: { id: true },
      });
    });
    revalidar(ordenId);
    return { error: null, conceptoId: idConceptoOrden("item", creado.id) };
  } catch (err) {
    return sinConcepto(friendlyPrismaErrorMessage(err, "Error al cambiar el tipo"));
  }
}

/** Quita todas las líneas de un kit aplicado, repuestos y mano de obra. */
export async function quitarKitOrdenAction(ordenId: string, grupoKitId: string): Promise<ResultadoAccion> {
  const session = await requirePermiso("ordenes.quitar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await ordenEditable(tenantDb, session, ordenId);
  if ("error" in orden) return { error: orden.error, success: false };

  try {
    const borradas = await tenantDb.$transaction(async (tx) => {
      const repuestos = await tx.itemOrden.deleteMany({ where: { ordenId, grupoKitId } });
      const manoDeObra = await tx.manoDeObra.deleteMany({ where: { ordenId, grupoKitId } });
      return repuestos.count + manoDeObra.count;
    });
    if (borradas === 0) return { error: "El kit ya no está en esta orden", success: false };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al quitar el kit"), success: false };
  }
  revalidar(ordenId);
  return { error: null, success: true };
}
