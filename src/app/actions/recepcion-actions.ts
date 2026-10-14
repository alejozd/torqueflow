"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { getTenantDb, type TenantPrismaClient } from "@/lib/db/tenant-client";
import { leerOpcionesTaller } from "@/lib/configuracion/opciones-taller";
import { estadoGarantia, type EstadoGarantia } from "@/lib/garantias/vigencia";
import type { ResultadoAccion } from "@/lib/resultado-accion";
import { isValidEstadoTransition } from "@/lib/orden/estado-transitions";
import { esOrdenMutable } from "@/lib/orden/mutable-guard";
import { scopeOrden } from "@/lib/sede/scope";
import { borrarArchivoDeOrden, saveOrdenArchivo, MAX_UPLOAD_SIZE_BYTES } from "@/lib/storage/local-file-storage";
import {
  actaDatosSchema,
  actaEntregaInputSchema,
  type ActaDatosInput,
  danioInputSchema,
  garantiaInputSchema,
  recepcionInputSchema,
} from "@/lib/validation/recepcion";
import type { EstadoOrden, Role } from "@/generated/prisma-tenant";

/**
 * Fase 21: recepción del vehículo (kilometraje, combustible y daños), acta de
 * entrega con firma y registro de garantías.
 *
 * La entrega es la operación delicada: `ENTREGADA` es inmutable para el resto de
 * la app (`mutable-guard.ts`), así que firmar y entregar ocurren **en la misma
 * transacción** (D6); si el cliente firma más tarde, existe `firmarActaAction`
 * como única excepción, y solo mientras el acta siga sin firmar.
 */

const ROLES_ORDEN: Role[] = ["ADMIN", "RECEPCION", "TECNICO"];
const ROLES_BORRAR: Role[] = ["ADMIN", "RECEPCION"];

const ORDEN_NO_ENCONTRADA = "Orden no encontrada";
const ORDEN_INMUTABLE = "La orden ya no se puede modificar";

/**
 * Errores centinela: abortan la transacción y el `catch` los traduce a un mensaje
 * para el usuario (no son fallos de base de datos).
 */
const ACTA_YA_FIRMADA = "__acta_ya_firmada__";
const ORDEN_CAMBIADA = "__orden_cambiada__";

/** Por qué dejó de ser editable la orden (D12), para poder decirlo. */
function mensajeInmutable(estado: EstadoOrden, facturada: boolean): string {
  if (facturada) return "La orden ya tiene factura: no se puede modificar";
  if (estado === "ENTREGADA") return "La orden ya está entregada: no se puede modificar";
  if (estado === "ANULADA") return "La orden está anulada: no se puede modificar";
  return ORDEN_INMUTABLE;
}

export interface RecepcionFormState {
  error: string | null;
  success: boolean;
}

export interface ActaFormState {
  error: string | null;
  success: boolean;
}

export interface EntregaFormState {
  error: string | null;
  success: boolean;
}

type OrdenEditable = { id: string; estado: EstadoOrden };

/** Carga la orden de la sede activa y comprueba que se pueda editar. */
async function cargarOrdenEditable(
  tenantDb: TenantPrismaClient,
  sedeActivaId: string,
  ordenId: string,
): Promise<{ orden: OrdenEditable } | { error: string }> {
  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(sedeActivaId) },
    select: { id: true, estado: true, factura: { select: { id: true } } },
  });
  if (!orden) return { error: ORDEN_NO_ENCONTRADA };
  if (!esOrdenMutable({ estado: orden.estado, factura: orden.factura })) {
    return { error: mensajeInmutable(orden.estado, Boolean(orden.factura)) };
  }
  return { orden: { id: orden.id, estado: orden.estado } };
}

/**
 * El acta se prepara (y la orden se entrega) mientras la orden no esté entregada
 * ni anulada. A diferencia del resto de la orden, **la factura no la bloquea**:
 * lo normal es facturar, cobrar y después entregar el carro (fase de
 * consolidación, D2). Lo inmutable con factura son los ítems y la mano de obra.
 */
async function cargarOrdenParaActa(
  tenantDb: TenantPrismaClient,
  sedeActivaId: string,
  ordenId: string,
): Promise<{ orden: OrdenEditable } | { error: string }> {
  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(sedeActivaId) },
    select: { id: true, estado: true, factura: { select: { id: true } } },
  });
  if (!orden) return { error: ORDEN_NO_ENCONTRADA };
  if (!actaEditable(orden.estado)) return { error: mensajeInmutable(orden.estado, false) };
  return { orden: { id: orden.id, estado: orden.estado } };
}

function actaEditable(estado: EstadoOrden): boolean {
  return estado !== "ENTREGADA" && estado !== "ANULADA";
}

interface FirmasGuardadas {
  firmaUrl?: string;
  firmaFotoUrl?: string;
}

const DATA_URL_IMAGEN = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/;

/**
 * Convierte el PNG que dibuja el canvas en un archivo. No se confía en el
 * cliente: el tamaño se comprueba **antes** de decodificar (para no cargar en
 * memoria una cadena enorme) y el archivo pasa después por las mismas
 * validaciones de MIME y magic bytes que cualquier subida.
 */
function archivoDeDataUrl(dataUrl: string): { file: File } | { error: string } {
  const coincidencia = DATA_URL_IMAGEN.exec(dataUrl.trim());
  if (!coincidencia) return { error: "La firma no tiene un formato válido" };

  const formato = coincidencia[1]!;
  const base64 = coincidencia[2]!.replace(/\s/g, "");
  // El margen del base64 es 4/3 (más el relleno): así nunca se decodifica de más.
  if (base64.length > (MAX_UPLOAD_SIZE_BYTES * 4) / 3 + 4) return { error: "La firma es demasiado grande" };

  const bytes = Buffer.from(base64, "base64");
  const extension = formato === "jpeg" ? "jpg" : formato;
  return { file: new File([bytes], `firma.${extension}`, { type: `image/${formato}` }) };
}

/**
 * Los archivos no se pueden revertir con la transacción: se guardan antes y, si
 * la escritura en la base falla, quien llama los borra con `limpiarFirmas`.
 */
async function guardarFirmaDeFormulario(
  tenantSchema: string,
  ordenId: string,
  formData: FormData,
): Promise<{ firmas: FirmasGuardadas; error?: string }> {
  const firma = formData.get("firma");
  const firmaDataUrl = formData.get("firmaDataUrl");
  const fotoActa = formData.get("fotoActa");

  const hayFirmaArchivo = firma instanceof File && firma.size > 0;
  const hayFirmaDibujo = typeof firmaDataUrl === "string" && firmaDataUrl.trim().length > 0;
  const hayFoto = fotoActa instanceof File && fotoActa.size > 0;

  if ([hayFirmaArchivo, hayFirmaDibujo, hayFoto].filter(Boolean).length > 1) {
    return { firmas: {}, error: "Deja solo una firma: la de pantalla o la foto" };
  }

  try {
    if (hayFirmaDibujo) {
      const archivo = archivoDeDataUrl(firmaDataUrl as string);
      if ("error" in archivo) return { firmas: {}, error: archivo.error };
      const guardada = await saveOrdenArchivo(tenantSchema, ordenId, "firma", archivo.file);
      return { firmas: { firmaUrl: guardada.url } };
    }
    if (hayFirmaArchivo) {
      const guardada = await saveOrdenArchivo(tenantSchema, ordenId, "firma", firma as File);
      return { firmas: { firmaUrl: guardada.url } };
    }
    if (hayFoto) {
      const guardada = await saveOrdenArchivo(tenantSchema, ordenId, "acta", fotoActa as File);
      return { firmas: { firmaFotoUrl: guardada.url } };
    }
  } catch (error) {
    return { firmas: {}, error: error instanceof Error ? error.message : "No se pudo guardar la firma" };
  }

  // Sin firma no es un error aquí: firmar la exige (por su esquema) y entregar
  // decide según la opción del taller.
  return { firmas: {} };
}

async function limpiarFirmas(tenantSchema: string, urls: (string | null | undefined)[]): Promise<void> {
  for (const url of urls) {
    if (!url) continue;
    try {
      await borrarArchivoDeOrden(tenantSchema, url);
    } catch {
      // Best effort: dejar un archivo suelto es mejor que tumbar la respuesta.
    }
  }
}

function revalidarActa(ordenId: string): void {
  revalidatePath(`/ordenes/${ordenId}`);
  revalidatePath(`/ordenes/${ordenId}/acta/imprimir`);
}

/** Las garantías también se ven en la ficha del vehículo, que hay que refrescar. */
function revalidarGarantias(ordenId: string): void {
  revalidarActa(ordenId);
  revalidatePath("/vehiculos/[id]", "page");
}

// ---------------------------------------------------------------- recepción

export async function guardarRecepcionAction(
  ordenId: string,
  prevState: RecepcionFormState,
  formData: FormData,
): Promise<RecepcionFormState> {
  const parsed = recepcionInputSchema.safeParse({
    kilometrajeIngreso: formData.get("kilometrajeIngreso") ?? "",
    nivelCombustible: formData.get("nivelCombustible") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const session = await requireRole(ROLES_ORDEN);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const revisada = await cargarOrdenEditable(tenantDb, session.user.sedeActivaId, ordenId);
  if ("error" in revisada) return { error: revisada.error, success: false };

  try {
    await tenantDb.ordenTrabajo.update({
      where: { id: ordenId },
      data: {
        kilometrajeIngreso: parsed.data.kilometrajeIngreso ?? null,
        nivelCombustible: parsed.data.nivelCombustible ?? null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar la recepción"), success: false };
  }

  revalidarActa(ordenId);
  return { error: null, success: true };
}

export async function agregarDanioAction(
  ordenId: string,
  prevState: RecepcionFormState,
  formData: FormData,
): Promise<RecepcionFormState> {
  const parsed = danioInputSchema.safeParse({
    zona: formData.get("zona") ?? "",
    tipo: formData.get("tipo") ?? "",
    nota: formData.get("nota") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const session = await requireRole(ROLES_ORDEN);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const revisada = await cargarOrdenEditable(tenantDb, session.user.sedeActivaId, ordenId);
  if ("error" in revisada) return { error: revisada.error, success: false };

  try {
    await tenantDb.danioOrden.create({
      data: {
        ordenId,
        zona: parsed.data.zona,
        tipo: parsed.data.tipo,
        nota: parsed.data.nota ?? null,
        creadoPorId: session.user.id,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { error: "Esa zona ya está marcada con ese mismo daño", success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo marcar el daño"), success: false };
  }

  revalidarActa(ordenId);
  return { error: null, success: true };
}

export async function quitarDanioAction(danioId: string): Promise<ResultadoAccion> {
  const session = await requireRole(ROLES_BORRAR);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const danio = await tenantDb.danioOrden.findFirst({
    where: { id: danioId, orden: { sedeId: session.user.sedeActivaId } },
    select: { id: true, ordenId: true, orden: { select: { estado: true, factura: { select: { id: true } } } } },
  });
  if (!danio) return { error: "Marca no encontrada", success: false };
  if (!esOrdenMutable(danio.orden)) return { error: ORDEN_INMUTABLE, success: false };

  try {
    await tenantDb.danioOrden.delete({ where: { id: danioId } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo quitar la marca"), success: false };
  }

  revalidarActa(danio.ordenId);
  return { error: null, success: true };
}

// ---------------------------------------------------------------- acta

/** Guarda el borrador del acta (sin firma): datos de quien recibe y notas. */
export async function guardarActaAction(
  ordenId: string,
  prevState: ActaFormState,
  formData: FormData,
): Promise<ActaFormState> {
  const parsed = actaDatosSchema.safeParse({
    recibidoPor: formData.get("recibidoPor") ?? "",
    documentoRecibe: formData.get("documentoRecibe") ?? "",
    observaciones: formData.get("observaciones") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const session = await requireRole(ROLES_ORDEN);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const revisada = await cargarOrdenParaActa(tenantDb, session.user.sedeActivaId, ordenId);
  if ("error" in revisada) return { error: revisada.error, success: false };

  try {
    await tenantDb.actaEntrega.upsert({
      where: { ordenId },
      create: { ordenId, ...parsed.data, creadoPorId: session.user.id },
      update: parsed.data,
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar el acta"), success: false };
  }

  revalidarActa(ordenId);
  return { error: null, success: true };
}

/**
 * Firma un acta pendiente de una orden ya entregada (el cliente firmó más tarde).
 * Es la única escritura permitida sobre una orden `ENTREGADA` (D6), y solo
 * mientras el acta no tenga firma.
 */
export async function firmarActaAction(
  ordenId: string,
  prevState: ActaFormState,
  formData: FormData,
): Promise<ActaFormState> {
  const session = await requireRole(ROLES_ORDEN);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    select: { id: true, estado: true, acta: { select: { id: true, firmadaAt: true, firmaUrl: true, firmaFotoUrl: true } } },
  });
  if (!orden) return { error: ORDEN_NO_ENCONTRADA, success: false };
  if (orden.estado !== "ENTREGADA") {
    return { error: "El acta se firma al entregar la orden, o después de entregarla", success: false };
  }
  if (orden.acta?.firmadaAt) return { error: "El acta ya está firmada", success: false };

  const guardada = await guardarFirmaDeFormulario(session.user.tenantSchema, ordenId, formData);
  if (guardada.error) return { error: guardada.error, success: false };

  const parsed = actaEntregaInputSchema.safeParse({
    recibidoPor: formData.get("recibidoPor") ?? "",
    documentoRecibe: formData.get("documentoRecibe") ?? "",
    observaciones: formData.get("observaciones") ?? "",
    ...guardada.firmas,
  });
  if (!parsed.success) {
    await limpiarFirmas(session.user.tenantSchema, [guardada.firmas.firmaUrl, guardada.firmas.firmaFotoUrl]);
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const { firmaUrl, firmaFotoUrl } = parsed.data;
  const firma = {
    recibidoPor: parsed.data.recibidoPor,
    documentoRecibe: parsed.data.documentoRecibe ?? null,
    observaciones: parsed.data.observaciones ?? null,
    firmaUrl: firmaUrl ?? null,
    firmaFotoUrl: firmaFotoUrl ?? null,
    firmadaAt: new Date(),
  };

  try {
    await tenantDb.$transaction(async (tx) => {
      // Condicional a propósito: si otra pestaña firmó entre la lectura y esta
      // escritura, `count` es 0 y la firma del cliente no se pisa.
      const firmadas = await tx.actaEntrega.updateMany({ where: { ordenId, firmadaAt: null }, data: firma });
      let actaId = orden.acta?.id ?? null;

      if (firmadas.count === 0) {
        const existente = await tx.actaEntrega.findFirst({ where: { ordenId }, select: { id: true } });
        if (existente) throw new Error(ACTA_YA_FIRMADA);
        // Una orden entregada sin acta (entrega forzada antes de la Fase 21)
        // todavía se puede arreglar firmándola.
        const creada = await tx.actaEntrega.create({
          data: { ordenId, ...firma, creadoPorId: session.user.id },
          select: { id: true },
        });
        actaId = creada.id;
      }

      await registrarEventoAuditoria(tx, {
        tipo: "ACTA_FIRMAR",
        actorId: session.user.id,
        entidadTipo: "ActaEntrega",
        entidadId: actaId ?? ordenId,
        detalle: { ordenId, firma: firmaUrl ? "pantalla" : "foto" },
      });
    });
  } catch (err) {
    await limpiarFirmas(session.user.tenantSchema, [firmaUrl, firmaFotoUrl]);
    if (err instanceof Error && err.message === ACTA_YA_FIRMADA) {
      return { error: "El acta ya está firmada", success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo firmar el acta"), success: false };
  }

  // La firma anterior (si la había) ya no la usa nadie.
  await limpiarFirmas(session.user.tenantSchema, [orden.acta?.firmaUrl, orden.acta?.firmaFotoUrl]);
  revalidarActa(ordenId);
  return { error: null, success: true };
}

/** Borra el borrador del acta (solo si la orden sigue editable y sin firmar). */
export async function borrarActaAction(ordenId: string): Promise<ResultadoAccion> {
  const session = await requireRole(ROLES_BORRAR);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    select: {
      id: true,
      estado: true,
      factura: { select: { id: true } },
      acta: { select: { id: true, firmadaAt: true, firmaUrl: true, firmaFotoUrl: true } },
    },
  });
  if (!orden) return { error: ORDEN_NO_ENCONTRADA, success: false };
  if (!orden.acta) return { error: "La orden no tiene acta", success: false };
  if (orden.acta.firmadaAt) return { error: "Un acta firmada no se borra", success: false };
  if (!actaEditable(orden.estado)) return { error: mensajeInmutable(orden.estado, false), success: false };

  try {
    // Condicional: si alguien firmó o entregó entre la lectura y este borrado no
    // se borra nada (dejaría la orden entregada sin su acta).
    const borradas = await tenantDb.actaEntrega.deleteMany({ where: { ordenId, firmadaAt: null } });
    if (borradas.count === 0) {
      return { error: "El acta cambió: ya está firmada o la orden se entregó", success: false };
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo borrar el acta"), success: false };
  }

  await limpiarFirmas(session.user.tenantSchema, [orden.acta.firmaUrl, orden.acta.firmaFotoUrl]);
  revalidarActa(ordenId);
  return { error: null, success: true };
}

// ---------------------------------------------------------------- entrega

const FIRMA_EXIGIDA =
  "Este taller exige el acta firmada para entregar: firma en pantalla o sube la foto del acta firmada.";

/** Algún dato del acta escrito en el formulario (nombre, documento u observaciones). */
function hayDatosDeActa(formData: FormData): boolean {
  return ["recibidoPor", "documentoRecibe", "observaciones"].some(
    (campo) => String(formData.get(campo) ?? "").trim() !== "",
  );
}

/**
 * Entrega la orden: cambia a `ENTREGADA` en una transacción junto con el acta.
 *
 * - **Con firma** (en pantalla o foto del papel): el acta queda firmada (D6 de la
 *   Fase 21) y se audita `ACTA_FIRMAR`.
 * - **Sin firma**: solo si el taller no la exige (opción "Exigir acta firmada",
 *   fase de consolidación D1). Si se escribió quién recibe, el acta queda sin
 *   firmar y se puede firmar después (`firmarActaAction`); si no se escribió
 *   nada, se entrega sin acta. Se audita `ORDEN_ENTREGAR`.
 *
 * La factura no impide entregar (D2): solo importa que la orden esté TERMINADA.
 * Si algo falla no queda ni la orden entregada ni el archivo suelto. No se avisa
 * al cliente: ENTREGADA no es un estado notificable a propósito
 * (`notificaciones/plantilla.ts`).
 */
export async function entregarOrdenAction(
  ordenId: string,
  prevState: EntregaFormState,
  formData: FormData,
): Promise<EntregaFormState> {
  const session = await requireRole(ROLES_ORDEN);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    include: {
      acta: { select: { id: true, firmadaAt: true, firmaUrl: true, firmaFotoUrl: true } },
    },
  });
  if (!orden) return { error: ORDEN_NO_ENCONTRADA, success: false };
  if (!actaEditable(orden.estado)) return { error: mensajeInmutable(orden.estado, false), success: false };
  if (!isValidEstadoTransition(orden.estado, "ENTREGADA")) {
    return { error: `No se puede entregar una orden en estado ${orden.estado}`, success: false };
  }

  const guardada = await guardarFirmaDeFormulario(session.user.tenantSchema, ordenId, formData);
  if (guardada.error) return { error: guardada.error, success: false };
  const firmada = Boolean(guardada.firmas.firmaUrl || guardada.firmas.firmaFotoUrl);

  if (!firmada) {
    const { exigirActaFirmada } = await leerOpcionesTaller(tenantDb);
    if (exigirActaFirmada) return { error: FIRMA_EXIGIDA, success: false };
  }

  // Con firma, el esquema completo (exactamente una firma). Sin firma, los datos
  // del acta solo si se escribió algo: unas observaciones sin el nombre de quien
  // recibe se rechazan en vez de perderse en silencio.
  let datos: ActaDatosInput | null = null;
  let firmaUrl: string | undefined;
  let firmaFotoUrl: string | undefined;
  const crudos = {
    recibidoPor: formData.get("recibidoPor") ?? "",
    documentoRecibe: formData.get("documentoRecibe") ?? "",
    observaciones: formData.get("observaciones") ?? "",
  };
  if (firmada) {
    const parsed = actaEntregaInputSchema.safeParse({ ...crudos, ...guardada.firmas });
    if (!parsed.success) {
      await limpiarFirmas(session.user.tenantSchema, [guardada.firmas.firmaUrl, guardada.firmas.firmaFotoUrl]);
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
    }
    ({ firmaUrl, firmaFotoUrl } = parsed.data);
    datos = parsed.data;
  } else if (hayDatosDeActa(formData)) {
    const parsed = actaDatosSchema.safeParse(crudos);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
    datos = parsed.data;
  }

  const nuevoEstado: EstadoOrden = "ENTREGADA";

  try {
    await tenantDb.$transaction(async (tx) => {
      // Condicional a propósito: si otra pestaña entregó entre la lectura y esta
      // escritura, `count` es 0 y no se pisa la entrega ya hecha.
      const transicion = await tx.ordenTrabajo.updateMany({
        where: { id: ordenId, estado: orden.estado },
        data: { estado: nuevoEstado, entregadaAt: new Date() },
      });
      if (transicion.count === 0) throw new Error(ORDEN_CAMBIADA);

      if (firmada && datos) {
        const firma = {
          recibidoPor: datos.recibidoPor,
          documentoRecibe: datos.documentoRecibe ?? null,
          observaciones: datos.observaciones ?? null,
          firmaUrl: firmaUrl ?? null,
          firmaFotoUrl: firmaFotoUrl ?? null,
          firmadaAt: new Date(),
        };
        const acta = await tx.actaEntrega.upsert({
          where: { ordenId },
          create: { ordenId, ...firma, creadoPorId: session.user.id },
          update: firma,
          select: { id: true },
        });
        await registrarEventoAuditoria(tx, {
          tipo: "ACTA_FIRMAR",
          actorId: session.user.id,
          entidadTipo: "ActaEntrega",
          entidadId: acta.id,
          detalle: { ordenId, estadoAnterior: orden.estado, firma: firmaUrl ? "pantalla" : "foto" },
        });
        return;
      }

      if (datos) {
        const acta = {
          recibidoPor: datos.recibidoPor,
          documentoRecibe: datos.documentoRecibe ?? null,
          observaciones: datos.observaciones ?? null,
        };
        await tx.actaEntrega.upsert({
          where: { ordenId },
          create: { ordenId, ...acta, creadoPorId: session.user.id },
          update: acta,
          select: { id: true },
        });
      }
      await registrarEventoAuditoria(tx, {
        tipo: "ORDEN_ENTREGAR",
        actorId: session.user.id,
        entidadTipo: "OrdenTrabajo",
        entidadId: ordenId,
        detalle: { estadoAnterior: orden.estado, sinFirma: true, conActa: datos !== null },
      });
    });
  } catch (err) {
    await limpiarFirmas(session.user.tenantSchema, [firmaUrl, firmaFotoUrl]);
    if (err instanceof Error && err.message === ORDEN_CAMBIADA) {
      return { error: "Otra persona ya cambió el estado de la orden: revisa antes de entregarla", success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo entregar la orden"), success: false };
  }

  // La firma anterior (si el acta ya existía) ya no la usa nadie.
  if (firmada) await limpiarFirmas(session.user.tenantSchema, [orden.acta?.firmaUrl, orden.acta?.firmaFotoUrl]);

  revalidarActa(ordenId);
  revalidatePath("/ordenes");
  return { error: null, success: true };
}

// ---------------------------------------------------------------- garantías

export async function agregarGarantiaAction(
  ordenId: string,
  prevState: RecepcionFormState,
  formData: FormData,
): Promise<RecepcionFormState> {
  const parsed = garantiaInputSchema.safeParse({
    tipo: formData.get("tipo") ?? "",
    manoDeObraId: formData.get("manoDeObraId") ?? "",
    itemOrdenId: formData.get("itemOrdenId") ?? "",
    descripcion: formData.get("descripcion") ?? "",
    cubreHasta: formData.get("cubreHasta") ?? "",
    cubreHastaKm: formData.get("cubreHastaKm") ?? "",
    nota: formData.get("nota") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const session = await requireRole(ROLES_ORDEN);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  // Las garantías siguen la regla del acta, no la de los ítems: se registran al
  // entregar, y lo normal es facturar antes de entregar (la factura no las bloquea).
  const revisada = await cargarOrdenParaActa(tenantDb, session.user.sedeActivaId, ordenId);
  if ("error" in revisada) return { error: revisada.error, success: false };

  // La línea cubierta tiene que ser de esta orden: si no, la garantía apuntaría
  // al trabajo o al repuesto de otra.
  if (parsed.data.tipo === "TRABAJO") {
    const linea = await tenantDb.manoDeObra.findFirst({
      where: { id: parsed.data.manoDeObraId, ordenId },
      select: { id: true },
    });
    if (!linea) return { error: "Ese trabajo no pertenece a la orden", success: false };
  } else {
    const linea = await tenantDb.itemOrden.findFirst({
      where: { id: parsed.data.itemOrdenId, ordenId },
      select: { id: true },
    });
    if (!linea) return { error: "Ese repuesto no pertenece a la orden", success: false };
  }

  try {
    await tenantDb.$transaction(async (tx) => {
      const garantia = await tx.garantia.create({
        data: {
          ordenId,
          tipo: parsed.data.tipo,
          manoDeObraId: parsed.data.tipo === "TRABAJO" ? (parsed.data.manoDeObraId ?? null) : null,
          itemOrdenId: parsed.data.tipo === "REPUESTO" ? (parsed.data.itemOrdenId ?? null) : null,
          descripcion: parsed.data.descripcion,
          cubreHasta: parsed.data.cubreHasta ? new Date(`${parsed.data.cubreHasta}T00:00:00.000Z`) : null,
          cubreHastaKm: parsed.data.cubreHastaKm ?? null,
          nota: parsed.data.nota ?? null,
          creadoPorId: session.user.id,
        },
        select: { id: true },
      });
      await registrarEventoAuditoria(tx, {
        tipo: "GARANTIA_REGISTRAR",
        actorId: session.user.id,
        entidadTipo: "Garantia",
        entidadId: garantia.id,
        detalle: {
          ordenId,
          tipo: parsed.data.tipo,
          cubreHasta: parsed.data.cubreHasta ?? null,
          cubreHastaKm: parsed.data.cubreHastaKm ?? null,
        },
      });
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo registrar la garantía"), success: false };
  }

  revalidarGarantias(ordenId);
  return { error: null, success: true };
}

export async function quitarGarantiaAction(garantiaId: string): Promise<ResultadoAccion> {
  const session = await requireRole(ROLES_BORRAR);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const garantia = await tenantDb.garantia.findFirst({
    where: { id: garantiaId, orden: { sedeId: session.user.sedeActivaId } },
    select: { id: true, ordenId: true, orden: { select: { estado: true, factura: { select: { id: true } } } } },
  });
  if (!garantia) return { error: "Garantía no encontrada", success: false };
  if (!actaEditable(garantia.orden.estado)) return { error: ORDEN_INMUTABLE, success: false };

  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.garantia.delete({ where: { id: garantiaId } });
      await registrarEventoAuditoria(tx, {
        tipo: "GARANTIA_ELIMINAR",
        actorId: session.user.id,
        entidadTipo: "Garantia",
        entidadId: garantiaId,
        detalle: { ordenId: garantia.ordenId },
      });
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo quitar la garantía"), success: false };
  }

  revalidarGarantias(garantia.ordenId);
  return { error: null, success: true };
}

export interface GarantiaVista {
  id: string;
  tipo: "TRABAJO" | "REPUESTO";
  descripcion: string;
  linea: string | null;
  cubreHasta: Date | null;
  cubreHastaKm: number | null;
  nota: string | null;
  registradaAt: Date;
  ordenId: string;
  sede: string;
  sedeId: string;
  estado: EstadoGarantia;
}

/**
 * Garantías de un vehículo para su ficha (D3): consulta de **todo el taller**, no
 * solo de la sede activa, porque el vehículo es del taller y una garantía
 * reclamada en otra sede tiene que verse igual.
 */
export async function listGarantiasDeVehiculo(vehiculoId: string): Promise<GarantiaVista[]> {
  const session = await requireRole(ROLES_ORDEN);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const vehiculo = await tenantDb.vehiculo.findFirst({
    where: { id: vehiculoId },
    select: { id: true, kilometraje: true },
  });
  if (!vehiculo) return [];

  const garantias = await tenantDb.garantia.findMany({
    where: { orden: { vehiculoId } },
    select: {
      id: true,
      tipo: true,
      descripcion: true,
      cubreHasta: true,
      cubreHastaKm: true,
      nota: true,
      createdAt: true,
      orden: { select: { id: true, sedeId: true, sede: { select: { nombre: true } } } },
      manoDeObra: { select: { descripcion: true } },
      itemOrden: { select: { descripcion: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const contexto = { hoy: new Date(), kilometraje: vehiculo.kilometraje ?? null };
  return garantias.map((garantia) => ({
    id: garantia.id,
    tipo: garantia.tipo,
    descripcion: garantia.descripcion,
    linea: garantia.manoDeObra?.descripcion ?? garantia.itemOrden?.descripcion ?? null,
    cubreHasta: garantia.cubreHasta,
    cubreHastaKm: garantia.cubreHastaKm,
    nota: garantia.nota,
    registradaAt: garantia.createdAt,
    ordenId: garantia.orden.id,
    sede: garantia.orden.sede.nombre,
    sedeId: garantia.orden.sedeId,
    estado: estadoGarantia(
      { cubreHasta: garantia.cubreHasta, cubreHastaKm: garantia.cubreHastaKm },
      contexto,
    ),
  }));
}
