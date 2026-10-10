"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { periodoActualBogota, periodoAnterior, rangoDelPeriodo } from "@/lib/gastos/periodo";
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

type Session = Awaited<ReturnType<typeof requireRole>>;
type TenantDb = ReturnType<typeof getTenantDb>;

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

/** RECEPCION siempre opera en su sede activa; ADMIN puede elegir otra. */
function resolverSede(session: Session, pedida: string | undefined): string {
  if (session.user.role === "RECEPCION") return session.user.sedeActivaId;
  return pedida || session.user.sedeActivaId;
}

async function validarSede(tenantDb: TenantDb, session: Session, sedeId: string): Promise<string | null> {
  if (sedeId === session.user.sedeActivaId) return null;
  const sede = await tenantDb.sede.findUnique({ where: { id: sedeId } });
  return sede ? null : "Sede no encontrada";
}

async function validarCategoria(
  tenantDb: TenantDb,
  categoriaId: string,
  categoriaActualDelGasto?: () => Promise<string | null>,
): Promise<string | null> {
  const categoria = await tenantDb.categoriaGasto.findUnique({ where: { id: categoriaId } });
  if (!categoria) return "La categoría no está disponible";
  if (categoria.activo) return null;
  // Editar un gasto permite conservar su categoría aunque se haya desactivado.
  if (categoriaActualDelGasto && (await categoriaActualDelGasto()) === categoriaId) return null;
  return "La categoría no está disponible";
}

export async function crearGastoAction(prevState: GastoFormState, formData: FormData): Promise<GastoFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const parsed = leerCampos(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  const { categoriaId, descripcion, monto, fecha, referencia } = parsed.data;

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = resolverSede(session, parsed.data.sedeId);
  const errorSede = await validarSede(tenantDb, session, sedeId);
  if (errorSede) return { error: errorSede, success: false };
  const errorCategoria = await validarCategoria(tenantDb, categoriaId);
  if (errorCategoria) return { error: errorCategoria, success: false };

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
  const session = await requireRole(["ADMIN"]);
  const parsed = leerCampos(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  const { categoriaId, descripcion, monto, fecha, referencia } = parsed.data;

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = resolverSede(session, parsed.data.sedeId);
  const errorSede = await validarSede(tenantDb, session, sedeId);
  if (errorSede) return { error: errorSede, success: false };
  const errorCategoria = await validarCategoria(tenantDb, categoriaId, async () => {
    const actual = await tenantDb.gasto.findUnique({ where: { id: gastoId }, select: { categoriaId: true } });
    return actual?.categoriaId ?? null;
  });
  if (errorCategoria) return { error: errorCategoria, success: false };

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
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo actualizar el gasto"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function eliminarGastoAction(gastoId: string): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.gasto.delete({ where: { id: gastoId } });
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
  const session = await requireRole(["ADMIN", "RECEPCION"]);
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
