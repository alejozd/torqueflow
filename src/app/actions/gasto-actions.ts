"use server";

import { revalidatePath } from "next/cache";
import { puede, requirePermiso } from "@/lib/auth/guards";
import { exigirCajaParaEfectivo } from "@/lib/caja/sesion";
import { leerOpcionesTaller } from "@/lib/configuracion/opciones-taller";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { ETIQUETA_MES, periodoActualBogota, periodoAnterior, rangoDelPeriodo } from "@/lib/gastos/periodo";
import { resolverSede, validarCategoria, validarSede } from "@/lib/gastos/validaciones-db";
import { roundMoney } from "@/lib/money/round";
import { gastoInputSchema, periodoSchema } from "@/lib/validation/gasto";

export interface GastoFila {
  id: string;
  fecha: Date;
  descripcion: string;
  categoriaId: string;
  categoriaNombre: string;
  referencia: string | null;
  monto: number;
  registradoPorNombre: string;
  esRecurrente: boolean;
  pagadoEnEfectivo: boolean;
}

export interface GastosDelMes {
  periodo: string;
  sedeId: string;
  filas: GastoFila[];
  total: number;
  totalMesAnterior: number;
  categoriaMayor: { nombre: string; monto: number } | null;
}

export interface GastoFormState {
  error: string | null;
  success: boolean;
}


function revalidar() {
  revalidatePath("/gastos");
  revalidatePath("/reportes");
}

function leerCampos(formData: FormData) {
  return gastoInputSchema.safeParse({
    categoriaId: formData.get("categoriaId") ?? "",
    descripcion: formData.get("descripcion") ?? "",
    monto: formData.get("monto") ?? "",
    fecha: formData.get("fecha") ?? "",
    referencia: formData.get("referencia") || undefined,
    sedeId: formData.get("sedeId") || undefined,
  });
}

function leerPagadoEnEfectivo(formData: FormData): boolean {
  return formData.get("pagadoEnEfectivo") === "true";
}

export async function crearGastoAction(prevState: GastoFormState, formData: FormData): Promise<GastoFormState> {
  const session = await requirePermiso("gastos.registrar");
  const parsed = leerCampos(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  const { categoriaId, descripcion, monto, fecha, referencia } = parsed.data;

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = resolverSede(session, parsed.data.sedeId);
  const errorSede = await validarSede(tenantDb, session, sedeId);
  if (errorSede) return { error: errorSede, success: false };
  const errorCategoria = await validarCategoria(tenantDb, categoriaId);
  if (errorCategoria) return { error: errorCategoria, success: false };

  // Un gasto pagado en efectivo sale del cajón (fase de consolidación, D3).
  const pagadoEnEfectivo = leerPagadoEnEfectivo(formData);
  const errorCaja = await exigirCajaParaEfectivo(
    tenantDb,
    sedeId,
    pagadoEnEfectivo,
    "Abre la caja antes de registrar un gasto pagado en efectivo",
  );
  if (errorCaja) return { error: errorCaja, success: false };

  try {
    await tenantDb.gasto.create({
      data: {
        sedeId,
        categoriaId,
        descripcion,
        monto,
        fecha: new Date(`${fecha}T00:00:00.000Z`),
        referencia: referencia ?? null,
        registradoPorId: session.user.id,
        pagadoEnEfectivo,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo registrar el gasto"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function actualizarGastoAction(
  gastoId: string,
  prevState: GastoFormState,
  formData: FormData,
): Promise<GastoFormState> {
  const session = await requirePermiso("gastos.administrar");
  const parsed = leerCampos(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  const { categoriaId, descripcion, monto, fecha, referencia } = parsed.data;

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const actual = await tenantDb.gasto.findUnique({
    where: { id: gastoId },
    select: { gastoRecurrenteId: true, periodo: true, sedeId: true, categoriaId: true, pagadoEnEfectivo: true },
  });
  // `gastos.administrar` se puede conceder a quien no trabaja con todas las
  // sedes (Fase 26, I2): sin `sedes.verTodas` solo cuenta su sede activa.
  if (!actual || (!puede(session, "sedes.verTodas") && actual.sedeId !== session.user.sedeActivaId)) {
    return { error: "Gasto no encontrado", success: false };
  }
  // Sin sedeId en el formulario se conserva la sede actual del gasto; sin
  // `sedes.verTodas` manda la sede activa.
  const sedeId = resolverSede(session, parsed.data.sedeId || actual.sedeId);
  if (actual.periodo) {
    if (fecha.slice(0, 7) !== actual.periodo) {
      return { error: `La fecha debe estar dentro de ${ETIQUETA_MES(actual.periodo)}`, success: false };
    }
    if (sedeId !== actual.sedeId) {
      return { error: "Un gasto recurrente no puede cambiar de sede", success: false };
    }
  }
  const errorSede = await validarSede(tenantDb, session, sedeId);
  if (errorSede) return { error: errorSede, success: false };
  const errorCategoria = await validarCategoria(tenantDb, categoriaId, actual.categoriaId);
  if (errorCategoria) return { error: errorCategoria, success: false };

  // Con control de caja, un gasto ya registrado no se convierte en "pagado en
  // efectivo": el arqueo lo cuenta por su `createdAt`, así que nunca entraría al
  // arqueo de la caja de hoy (fase de consolidación, D5 / hallazgo B3).
  const pagadoEnEfectivo = leerPagadoEnEfectivo(formData);
  if (pagadoEnEfectivo && !actual.pagadoEnEfectivo && (await leerOpcionesTaller(tenantDb)).usarControlCaja) {
    return {
      error: "Un gasto ya registrado no se puede pasar a efectivo: registra un gasto nuevo pagado en efectivo",
      success: false,
    };
  }

  try {
    await tenantDb.gasto.update({
      where: { id: gastoId },
      data: {
        sedeId,
        categoriaId,
        descripcion,
        monto,
        fecha: new Date(`${fecha}T00:00:00.000Z`),
        referencia: referencia ?? null,
        pagadoEnEfectivo,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo actualizar el gasto"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function eliminarGastoAction(gastoId: string): Promise<{ error: string | null }> {
  const session = await requirePermiso("gastos.administrar");
  const tenantDb = getTenantDb(session.user.tenantSchema);
  // Sin `sedes.verTodas` solo se borra un gasto de la sede activa (Fase 26, I2).
  const where = puede(session, "sedes.verTodas") ? { id: gastoId } : { id: gastoId, sedeId: session.user.sedeActivaId };
  try {
    const { count } = await tenantDb.gasto.deleteMany({ where });
    if (count === 0) return { error: "Gasto no encontrado" };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo eliminar el gasto") };
  }
  revalidar();
  return { error: null };
}

export async function listGastos(filtros: {
  periodo?: string;
  sedeId?: string;
  categoriaId?: string;
}): Promise<GastosDelMes> {
  const session = await requirePermiso("gastos.registrar");
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const periodo = periodoSchema.safeParse(filtros.periodo).success
    ? (filtros.periodo as string)
    : periodoActualBogota(new Date());
  const sedeId = resolverSede(session, filtros.sedeId);

  // Una sola consulta del mes completo de la sede: el filtro por categoría se
  // aplica en memoria sobre `filas`, así `total` y `categoriaMayor` siempre
  // describen el mes entero (no la categoría filtrada) sin una segunda consulta.
  const filasMes = await tenantDb.gasto.findMany({
    where: { sedeId, fecha: rangoDelPeriodo(periodo) },
    include: { categoria: { select: { nombre: true } }, registradoPor: { select: { nombre: true } } },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
  });
  const anterior = await tenantDb.gasto.aggregate({
    _sum: { monto: true },
    where: { sedeId, fecha: rangoDelPeriodo(periodoAnterior(periodo)) },
  });

  const todas: GastoFila[] = filasMes.map((g) => ({
    id: g.id,
    fecha: g.fecha,
    descripcion: g.descripcion,
    categoriaId: g.categoriaId,
    categoriaNombre: g.categoria.nombre,
    referencia: g.referencia,
    monto: Number(g.monto),
    registradoPorNombre: g.registradoPor.nombre,
    esRecurrente: g.gastoRecurrenteId !== null,
    pagadoEnEfectivo: g.pagadoEnEfectivo,
  }));

  const porCategoria = new Map<string, { nombre: string; monto: number }>();
  for (const fila of todas) {
    const acumulado = porCategoria.get(fila.categoriaId) ?? { nombre: fila.categoriaNombre, monto: 0 };
    acumulado.monto += fila.monto;
    porCategoria.set(fila.categoriaId, acumulado);
  }
  let categoriaMayor: GastosDelMes["categoriaMayor"] = null;
  for (const c of porCategoria.values()) {
    if (!categoriaMayor || c.monto > categoriaMayor.monto) {
      categoriaMayor = { nombre: c.nombre, monto: roundMoney(c.monto) };
    }
  }

  return {
    periodo,
    sedeId,
    filas: filtros.categoriaId ? todas.filter((f) => f.categoriaId === filtros.categoriaId) : todas,
    total: roundMoney(todas.reduce((suma, f) => suma + f.monto, 0)),
    totalMesAnterior: roundMoney(Number(anterior._sum.monto ?? 0)),
    categoriaMayor,
  };
}
