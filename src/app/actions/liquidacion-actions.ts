"use server";

import { revalidatePath } from "next/cache";
import { requirePermiso } from "@/lib/auth/guards";
import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { exigirCajaParaEfectivo } from "@/lib/caja/sesion";
import { leerFrecuenciaLiquidacion } from "@/lib/liquidaciones/configuracion";
import { CATEGORIA_LIQUIDACION_ID } from "@/lib/liquidaciones/categorias";
import { calcularMontoLiquidacion, montoPorTrabajo, totalLiquidacion } from "@/lib/liquidaciones/calculo";
import { etiquetaPeriodo, frecuenciaDePeriodo, rangoDelPeriodo, ventanasSolapan } from "@/lib/liquidaciones/periodo";
import { computeProduccionPorMecanico } from "@/lib/liquidaciones/produccion";
import {
  ajusteLiquidacionInputSchema,
  esquemaLiquidacionInputSchema,
  frecuenciaLiquidacionSchema,
  motivoAnulacionSchema,
  pagarLiquidacionInputSchema,
  periodoLiquidacionInputSchema,
} from "@/lib/validation/liquidacion";
import { CONFIGURACION_TALLER_ID } from "@/lib/vencimientos/configuracion";
import type { FrecuenciaLiquidacion, Prisma, TipoEsquemaLiquidacion } from "@/generated/prisma-tenant";
import { ROLES_MECANICO } from "@/lib/auth/permisos";

/**
 * Liquidación de mecánicos (Fase 19, simplificada en la consolidación, D10).
 *
 * La tabla del periodo es **en vivo**: lo producido por cada técnico y lo que le
 * corresponde según su esquema. El documento (`LiquidacionMecanico`) nace **al
 * pagar**, con la foto de ese momento y el gasto que lo lleva al arqueo. Anular
 * borra el gasto y deja el periodo otra vez por pagar. No hay paso de "generar"
 * ni documentos pendientes que mantener al día.
 */

export interface TecnicoConEsquema {
  usuarioId: string;
  nombre: string;
  /** null = el técnico no tiene esquema y por tanto no se liquida (D4). */
  tipo: TipoEsquemaLiquidacion | null;
  porcentaje: number | null;
  montoFijo: number | null;
}

export interface EsquemaLiquidacionFormState {
  error: string | null;
  success: boolean;
}

export interface FrecuenciaLiquidacionFormState {
  error: string | null;
  success: boolean;
}

export interface PagoLiquidacionFormState {
  error: string | null;
  success: boolean;
}

/** Lo congelado de una liquidación pagada. */
export interface LiquidacionPagada {
  id: string;
  montoCalculado: number;
  ajuste: number;
  motivoAjuste: string | null;
  total: number;
  pagadaAt: Date | null;
}

export interface LiquidacionFila {
  usuarioId: string;
  nombre: string;
  /** Lo producido en el periodo (vivo), atribuido por líneas de mano de obra. */
  ordenes: number;
  trabajos: number;
  montoManoObra: number;
  montoPorTrabajo: number | null;
  /** Esquema vigente; null = sin esquema, no se liquida. */
  tipo: TipoEsquemaLiquidacion | null;
  porcentaje: number | null;
  montoFijo: number | null;
  montoSugerido: number | null;
  /** La ventana ya está pagada en otro periodo del mismo técnico (cambio de frecuencia). */
  solapada: boolean;
  /** null = por pagar. */
  pago: LiquidacionPagada | null;
}

export interface LiquidacionesDelPeriodoResultado {
  frecuencia: FrecuenciaLiquidacion;
  periodo: string;
  etiqueta: string;
  error: string | null;
  filas: LiquidacionFila[];
  /** Mano de obra del periodo que no se le puede liquidar a nadie (sin mecánico). */
  sinAsignar: { ordenes: number; trabajos: number; montoManoObra: number } | null;
}

const TECNICO_NO_ENCONTRADO = "Técnico no encontrado en tu sede activa";
const LIQUIDACION_NO_ENCONTRADA = "Liquidación no encontrada";
const YA_PAGADA = "Esa liquidación ya está pagada";
const LIQUIDACION_CAMBIO_AL_ANULAR =
  "La liquidación cambió mientras la anulabas: revisa antes de volver a intentarlo";
const CATEGORIA_FALTANTE = "Falta la categoría de gasto del sistema: aplica la migración de la fase 19";

/** Un rechazo dentro de la transacción del pago: revierte y su mensaje va al usuario. */
class PagoRechazado extends Error {}

type Lector = Pick<Prisma.TransactionClient, "liquidacionMecanico" | "usuario" | "ordenTrabajo">;

function aNumero(valor: { toString(): string } | null | undefined): number | null {
  return valor === null || valor === undefined ? null : Number(valor.toString());
}

function revalidarDinero() {
  revalidatePath("/liquidaciones");
  revalidatePath("/gastos");
  revalidatePath("/caja");
  revalidatePath("/reportes");
}

/**
 * Guarda la forma de pago de un técnico. El campo que no aplica al tipo elegido
 * se guarda en null (D4): cambiar de porcentaje a fijo no deja un monto base
 * viejo escondido en la fila.
 */
export async function guardarEsquemaLiquidacionAction(
  usuarioId: string,
  prevState: EsquemaLiquidacionFormState,
  formData: FormData,
): Promise<EsquemaLiquidacionFormState> {
  const session = await requirePermiso("liquidaciones.gestionar");
  const parsed = esquemaLiquidacionInputSchema.safeParse({
    tipo: formData.get("tipo") ?? "",
    porcentaje: formData.get("porcentaje") ?? "",
    montoFijo: formData.get("montoFijo") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);

  // El esquema es del técnico en su sede: uno de otra sede no se toca desde aquí.
  const tecnico = await tenantDb.usuario.findFirst({
    where: { id: usuarioId, role: { in: [...ROLES_MECANICO] }, sedes: { some: { sedeId: session.user.sedeActivaId } } },
    select: { id: true },
  });
  if (!tecnico) return { error: TECNICO_NO_ENCONTRADO, success: false };

  const { tipo } = parsed.data;
  const porcentaje = tipo === "FIJO" ? null : (parsed.data.porcentaje ?? null);
  const montoFijo = tipo === "PORCENTAJE" ? null : (parsed.data.montoFijo ?? null);

  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.esquemaLiquidacion.upsert({
        where: { usuarioId },
        create: { usuarioId, tipo, porcentaje, montoFijo },
        update: { tipo, porcentaje, montoFijo },
      });
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_ESQUEMA_ACTUALIZAR",
        actorId: session.user.id,
        entidadTipo: "EsquemaLiquidacion",
        entidadId: usuarioId,
        detalle: { tipo, porcentaje, montoFijo },
      });
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar el esquema"), success: false };
  }

  revalidatePath("/liquidaciones");
  return { error: null, success: true };
}

export async function getFrecuenciaLiquidacion(): Promise<FrecuenciaLiquidacion> {
  const session = await requirePermiso("liquidaciones.gestionar");
  return leerFrecuenciaLiquidacion(getTenantDb(session.user.tenantSchema));
}

/**
 * Cambia cada cuánto liquida el taller (D5). Cambiar a mitad de mes no arriesga
 * un doble pago: pagar un periodo cuya ventana ya está pagada en otro se rechaza.
 */
export async function guardarFrecuenciaLiquidacionAction(
  prevState: FrecuenciaLiquidacionFormState,
  formData: FormData,
): Promise<FrecuenciaLiquidacionFormState> {
  const session = await requirePermiso("liquidaciones.gestionar");
  const parsed = frecuenciaLiquidacionSchema.safeParse(formData.get("frecuencia"));
  if (!parsed.success) return { error: "Frecuencia inválida", success: false };

  try {
    await getTenantDb(session.user.tenantSchema).$transaction(async (tx) => {
      await tx.configuracionTaller.upsert({
        where: { id: CONFIGURACION_TALLER_ID },
        create: { id: CONFIGURACION_TALLER_ID, frecuenciaLiquidacion: parsed.data },
        update: { frecuenciaLiquidacion: parsed.data },
      });
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_FRECUENCIA_ACTUALIZAR",
        actorId: session.user.id,
        entidadTipo: "ConfiguracionTaller",
        entidadId: CONFIGURACION_TALLER_ID,
        detalle: { frecuencia: parsed.data },
      });
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar la frecuencia"), success: false };
  }

  revalidatePath("/liquidaciones");
  return { error: null, success: true };
}

/**
 * Por técnico de la sede: lo que produjo en el periodo (vivo), su esquema
 * vigente, el monto que le corresponde y el pago, si ya lo hay. Reporte y
 * liquidación comparten la agregación (`computeProduccionPorMecanico`), así que
 * no pueden divergir. Se usa igual fuera y dentro de la transacción del pago.
 */
async function cargarFilasDelPeriodo(
  db: Lector,
  sedeId: string,
  frecuencia: FrecuenciaLiquidacion,
  periodo: string,
): Promise<Pick<LiquidacionesDelPeriodoResultado, "filas" | "sinAsignar">> {
  const rango = rangoDelPeriodo(frecuencia, periodo);

  // Solo cuentan los pagos: una anulada (o una pendiente de antes de la
  // simplificación) deja el periodo por pagar. Son pocas filas por sede.
  const pagadas = await db.liquidacionMecanico.findMany({
    where: { sedeId, estado: "PAGADA" },
    select: {
      id: true,
      usuarioId: true,
      periodo: true,
      frecuencia: true,
      montoCalculado: true,
      ajuste: true,
      motivoAjuste: true,
      total: true,
      pagadaAt: true,
    },
  });
  const esDelPeriodo = (pagada: { periodo: string; frecuencia: FrecuenciaLiquidacion }) =>
    pagada.periodo === periodo && pagada.frecuencia === frecuencia;

  // Un técnico que ya no está en la sede pero tiene un pago de este periodo
  // también entra: si no, ese pago quedaría imposible de anular.
  const idsConPago = pagadas.filter(esDelPeriodo).map((pagada) => pagada.usuarioId);
  const tecnicosDeLaSede = { role: { in: [...ROLES_MECANICO] }, sedes: { some: { sedeId } } };

  const [tecnicos, ordenes] = await Promise.all([
    db.usuario.findMany({
      where: idsConPago.length > 0 ? { OR: [tecnicosDeLaSede, { id: { in: idsConPago } }] } : tecnicosDeLaSede,
      select: {
        id: true,
        nombre: true,
        esquemaLiquidacion: { select: { tipo: true, porcentaje: true, montoFijo: true } },
      },
      orderBy: { nombre: "asc" },
    }),
    db.ordenTrabajo.findMany({
      where: { sedeId, estado: "ENTREGADA", entregadaAt: { gte: rango.gte, lt: rango.lt } },
      select: {
        mecanicoId: true,
        mecanico: { select: { nombre: true } },
        manoDeObra: { select: { valor: true, mecanicoId: true, mecanico: { select: { nombre: true } } } },
      },
    }),
  ]);

  const produccion = computeProduccionPorMecanico(
    ordenes.map((orden) => ({
      mecanicoId: orden.mecanicoId,
      mecanicoNombre: orden.mecanico?.nombre ?? null,
      manoDeObra: orden.manoDeObra.map((linea) => ({
        valor: Number(linea.valor),
        mecanicoId: linea.mecanicoId,
        mecanicoNombre: linea.mecanico?.nombre ?? null,
      })),
    })),
  );
  const porMecanico = new Map(produccion.flatMap((fila) => (fila.mecanicoId ? [[fila.mecanicoId, fila]] : [])));
  // La bolsa "Sin asignar" no se liquida (no hay a quién), pero se avisa: es
  // trabajo que nadie cobra.
  const sinAsignarBruto = produccion.find((fila) => fila.mecanicoId === null);
  const sinAsignar = sinAsignarBruto
    ? { ordenes: sinAsignarBruto.ordenes, trabajos: sinAsignarBruto.trabajos, montoManoObra: sinAsignarBruto.montoManoObra }
    : null;

  const filas = tecnicos.map((tecnico): LiquidacionFila => {
    const vivo = porMecanico.get(tecnico.id) ?? { ordenes: 0, trabajos: 0, montoManoObra: 0 };
    const esquema = tecnico.esquemaLiquidacion
      ? {
          tipo: tecnico.esquemaLiquidacion.tipo,
          porcentaje: aNumero(tecnico.esquemaLiquidacion.porcentaje),
          montoFijo: aNumero(tecnico.esquemaLiquidacion.montoFijo),
        }
      : null;
    const suyas = pagadas.filter((pagada) => pagada.usuarioId === tecnico.id);
    const pago = suyas.find(esDelPeriodo) ?? null;

    return {
      usuarioId: tecnico.id,
      nombre: tecnico.nombre,
      ordenes: vivo.ordenes,
      trabajos: vivo.trabajos,
      montoManoObra: vivo.montoManoObra,
      montoPorTrabajo: montoPorTrabajo(vivo.montoManoObra, vivo.trabajos),
      tipo: esquema?.tipo ?? null,
      porcentaje: esquema?.porcentaje ?? null,
      montoFijo: esquema?.montoFijo ?? null,
      montoSugerido: esquema ? calcularMontoLiquidacion(esquema, vivo.montoManoObra) : null,
      solapada: suyas.some(
        (pagada) => !esDelPeriodo(pagada) && ventanasSolapan(pagada.frecuencia, pagada.periodo, frecuencia, periodo),
      ),
      pago: pago
        ? {
            id: pago.id,
            montoCalculado: Number(pago.montoCalculado),
            ajuste: Number(pago.ajuste),
            motivoAjuste: pago.motivoAjuste,
            total: Number(pago.total),
            pagadaAt: pago.pagadaAt,
          }
        : null,
    };
  });

  return { filas, sinAsignar };
}

/**
 * La frecuencia sale de la forma del periodo, no del ajuste del taller: así un
 * periodo ya pagado (mensual, por ejemplo) sigue siendo legible y anulable
 * después de que el taller pase a quincenal.
 */
async function resolverPeriodo(
  tenantDb: ReturnType<typeof getTenantDb>,
  periodo: string,
): Promise<{ frecuencia: FrecuenciaLiquidacion; error: string | null }> {
  const frecuencia = frecuenciaDePeriodo(periodo) ?? (await leerFrecuenciaLiquidacion(tenantDb));
  const parsed = periodoLiquidacionInputSchema.safeParse({ frecuencia, periodo });
  return { frecuencia, error: parsed.success ? null : (parsed.error.issues[0]?.message ?? "Periodo inválido") };
}

export async function listLiquidacionesDelPeriodo(periodo: string): Promise<LiquidacionesDelPeriodoResultado> {
  const session = await requirePermiso("liquidaciones.gestionar");
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const { frecuencia, error } = await resolverPeriodo(tenantDb, periodo);
  if (error) return { frecuencia, periodo, etiqueta: "", error, filas: [], sinAsignar: null };

  const { filas, sinAsignar } = await cargarFilasDelPeriodo(tenantDb, session.user.sedeActivaId, frecuencia, periodo);
  return { frecuencia, periodo, etiqueta: etiquetaPeriodo(frecuencia, periodo), error: null, filas, sinAsignar };
}

/**
 * Paga la liquidación de un técnico en un periodo. En una sola transacción:
 * bloquea al técnico (dos pagos suyos a la vez van en fila), recalcula en el
 * servidor (el monto nunca viene del formulario), crea el gasto con la categoría
 * del sistema (así entra al arqueo y a la rentabilidad, D8) y congela el
 * documento como PAGADA. Contra el doble pago: el índice único por técnico y
 * periodo, la escritura condicional a "no pagada" y la guarda de solape entre
 * frecuencias.
 */
export async function pagarLiquidacionAction(
  usuarioId: string,
  periodo: string,
  prevState: PagoLiquidacionFormState,
  formData: FormData,
): Promise<PagoLiquidacionFormState> {
  const session = await requirePermiso("liquidaciones.gestionar");
  const pago = pagarLiquidacionInputSchema.safeParse({
    metodoPago: formData.get("metodoPago") ?? "",
    referencia: formData.get("referencia") ?? "",
    fecha: formData.get("fecha") ?? "",
  });
  if (!pago.success) return { error: pago.error.issues[0]?.message ?? "Datos inválidos", success: false };
  const ajuste = ajusteLiquidacionInputSchema.safeParse({
    ajuste: formData.get("ajuste") || "0",
    motivo: formData.get("motivoAjuste") ?? "",
  });
  if (!ajuste.success) return { error: ajuste.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;
  const { frecuencia, error: errorPeriodo } = await resolverPeriodo(tenantDb, periodo);
  if (errorPeriodo) return { error: errorPeriodo, success: false };

  const categoria = await tenantDb.categoriaGasto.findUnique({
    where: { id: CATEGORIA_LIQUIDACION_ID },
    select: { id: true, activo: true },
  });
  if (!categoria) return { error: CATEGORIA_FALTANTE, success: false };
  if (!categoria.activo) {
    return { error: "La categoría 'Liquidación de mecánicos' está desactivada: actívala en Gastos → Configuración", success: false };
  }

  const { metodoPago, referencia, fecha } = pago.data;
  // Pagarla en efectivo saca dinero del cajón: con control de caja exige la
  // caja abierta (hallazgo M1).
  const errorCaja = await exigirCajaParaEfectivo(
    tenantDb,
    sedeId,
    metodoPago,
    "Abre la caja antes de pagar la liquidación en efectivo",
  );
  if (errorCaja) return { error: errorCaja, success: false };

  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${usuarioId} FOR UPDATE`;

      const { filas } = await cargarFilasDelPeriodo(tx, sedeId, frecuencia, periodo);
      const fila = filas.find((candidata) => candidata.usuarioId === usuarioId);
      if (!fila) throw new PagoRechazado(TECNICO_NO_ENCONTRADO);
      const tipo = fila.tipo;
      if (!tipo) throw new PagoRechazado("Ese técnico no tiene esquema de pago: defínelo antes de pagar");
      if (fila.pago) throw new PagoRechazado(YA_PAGADA);
      if (fila.solapada) throw new PagoRechazado("Ese trabajo ya se pagó en otro periodo de este técnico");

      const montoCalculado = fila.montoSugerido ?? 0;
      const total = totalLiquidacion(montoCalculado, ajuste.data.ajuste);
      if (total <= 0) throw new PagoRechazado("El total a pagar debe ser mayor que cero");

      const gasto = await tx.gasto.create({
        data: {
          sedeId,
          categoriaId: CATEGORIA_LIQUIDACION_ID,
          descripcion: `Liquidación ${fila.nombre} · ${etiquetaPeriodo(frecuencia, periodo)}`,
          monto: total,
          fecha: new Date(`${fecha}T00:00:00.000Z`),
          referencia: referencia ?? null,
          registradoPorId: session.user.id,
          pagadoEnEfectivo: metodoPago === "EFECTIVO",
        },
      });

      const ahora = new Date();
      const foto = {
        estado: "PAGADA" as const,
        ordenes: fila.ordenes,
        trabajos: fila.trabajos,
        montoManoObra: fila.montoManoObra,
        tipo,
        porcentaje: fila.porcentaje,
        montoFijo: fila.montoFijo,
        montoCalculado,
        ajuste: ajuste.data.ajuste,
        motivoAjuste: ajuste.data.motivo ?? null,
        total,
        gastoId: gasto.id,
        generadaPorId: session.user.id,
        generadaAt: ahora,
        pagadaPorId: session.user.id,
        pagadaAt: ahora,
      };

      // Un periodo anulado (o una pendiente de antes de la simplificación) ya
      // tiene su fila: el índice único por técnico y periodo obliga a reutilizarla.
      const existente = await tx.liquidacionMecanico.findUnique({
        where: { periodo_usuarioId_sedeId: { periodo, usuarioId, sedeId } },
        select: { id: true },
      });
      let liquidacionId: string;
      if (existente) {
        const { count } = await tx.liquidacionMecanico.updateMany({
          where: { id: existente.id, estado: { not: "PAGADA" } },
          data: { ...foto, frecuencia, anuladaAt: null, anuladaPorId: null, motivoAnulacion: null },
        });
        if (count !== 1) throw new PagoRechazado(YA_PAGADA);
        liquidacionId = existente.id;
      } else {
        const creada = await tx.liquidacionMecanico.create({
          data: { ...foto, periodo, frecuencia, sedeId, usuarioId },
        });
        liquidacionId = creada.id;
      }

      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_PAGAR",
        actorId: session.user.id,
        entidadTipo: "LiquidacionMecanico",
        entidadId: liquidacionId,
        detalle: {
          periodo,
          frecuencia,
          usuarioId,
          metodoPago,
          referencia: referencia ?? null,
          montoCalculado,
          ajuste: ajuste.data.ajuste,
          motivoAjuste: ajuste.data.motivo ?? null,
          monto: total,
          gastoId: gasto.id,
        },
      });
    });
  } catch (err) {
    if (err instanceof PagoRechazado) return { error: err.message, success: false };
    // Dos pagos que crean el documento a la vez: el índice único deja pasar uno.
    if ((err as { code?: string } | null)?.code === "P2002") return { error: YA_PAGADA, success: false };
    return { error: friendlyPrismaErrorMessage(err, "No se pudo pagar la liquidación"), success: false };
  }

  revalidarDinero();
  return { error: null, success: true };
}

/**
 * Anula un pago equivocado: borra el gasto que lo materializó en la misma
 * transacción (D9), así la caja lo refleja, y el periodo vuelve a quedar por
 * pagar. La auditoría guarda el rastro de las dos cosas.
 */
export async function anularLiquidacionAction(liquidacionId: string, motivo: string): Promise<{ error: string | null }> {
  const session = await requirePermiso("liquidaciones.gestionar");
  const parsed = motivoAnulacionSchema.safeParse(motivo);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Explica por qué se anula la liquidación" };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const documento = await tenantDb.liquidacionMecanico.findFirst({
    where: { id: liquidacionId, sedeId: session.user.sedeActivaId },
    select: { id: true, estado: true, gastoId: true },
  });
  if (!documento) return { error: LIQUIDACION_NO_ENCONTRADA };
  if (documento.estado !== "PAGADA") return { error: "Solo se puede anular una liquidación pagada" };

  try {
    await tenantDb.$transaction(async (tx) => {
      if (documento.gastoId) {
        // deleteMany: si el gasto ya no está (alguien lo borró desde /gastos),
        // anular no debe fallar por eso.
        await tx.gasto.deleteMany({ where: { id: documento.gastoId } });
      }
      const { count } = await tx.liquidacionMecanico.updateMany({
        // Condicional al estado **y al gasto** leídos (hallazgo B1): si cambió
        // entre la lectura y aquí, el gasto borrado arriba no es el suyo y la
        // transacción revierte.
        where: { id: liquidacionId, estado: "PAGADA", gastoId: documento.gastoId },
        data: {
          estado: "ANULADA",
          anuladaAt: new Date(),
          anuladaPorId: session.user.id,
          motivoAnulacion: parsed.data,
          gastoId: null,
        },
      });
      if (count !== 1) throw new Error(LIQUIDACION_CAMBIO_AL_ANULAR);
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_ANULAR",
        actorId: session.user.id,
        entidadTipo: "LiquidacionMecanico",
        entidadId: liquidacionId,
        detalle: { motivo: parsed.data, gastoEliminado: documento.gastoId },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === LIQUIDACION_CAMBIO_AL_ANULAR) return { error: err.message };
    return { error: friendlyPrismaErrorMessage(err, "No se pudo anular la liquidación") };
  }

  revalidarDinero();
  return { error: null };
}

/** Deja a un técnico sin esquema: deja de liquidarse hasta que se le defina otro (D4). */
export async function quitarEsquemaLiquidacionAction(usuarioId: string): Promise<{ error: string | null }> {
  const session = await requirePermiso("liquidaciones.gestionar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const tecnico = await tenantDb.usuario.findFirst({
    where: { id: usuarioId, role: { in: [...ROLES_MECANICO] }, sedes: { some: { sedeId: session.user.sedeActivaId } } },
    select: { id: true },
  });
  if (!tecnico) return { error: TECNICO_NO_ENCONTRADO };

  try {
    await tenantDb.$transaction(async (tx) => {
      const { count } = await tx.esquemaLiquidacion.deleteMany({ where: { usuarioId } });
      if (count === 0) throw new Error("Ese técnico no tiene esquema que quitar");
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_ESQUEMA_ACTUALIZAR",
        actorId: session.user.id,
        entidadTipo: "EsquemaLiquidacion",
        entidadId: usuarioId,
        detalle: { eliminado: true },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Ese técnico no tiene esquema que quitar") return { error: err.message };
    return { error: friendlyPrismaErrorMessage(err, "No se pudo quitar el esquema") };
  }

  revalidatePath("/liquidaciones");
  return { error: null };
}
