import { ROLES_MECANICO } from "@/lib/auth/permisos";
import type { getTenantDb } from "@/lib/db/tenant-client";

export const SCHEMA_PERMITIDO = "taller_dev";
export const MARCA = "[datos-semana]";
export const CLIENTE_PROTEGIDO = "Andrea Valencia Ríos";
export const PLACAS_PROTEGIDAS = ["JKT482", "MRW615", "HBL290", "DFN734"] as const;

export type TenantDb = ReturnType<typeof getTenantDb>;

export interface Contexto {
  schema: string;
  actorId: string;
  recepcionistaId: string;
  sedes: { id: string; nombre: string }[];
  mecanicos: { id: string; nombre: string; sedeIds: string[] }[];
  repuestos: {
    id: string; nombre: string; precioCompra: number; precioVenta: number;
    stockActual: number; stockMinimo: number; bodegaId: string; proveedorId: string | null;
  }[];
  servicios: { id: string; nombre: string }[];
  proveedores: { id: string; nombre: string }[];
  categoriasGasto: { id: string; nombre: string }[];
  clientesExistentes: { id: string; vehiculoIds: string[] }[];
  placasOcupadas: Set<string>;
}

export function exigirSchemaPermitido(schema: string): void {
  if (schema !== SCHEMA_PERMITIDO) {
    throw new Error(`Solo se permite ${SCHEMA_PERMITIDO} (recibido: ${schema})`);
  }
}

const aNumero = (v: { toNumber(): number } | number): number => (typeof v === "number" ? v : v.toNumber());

export async function cargarContexto(db: TenantDb, schema: string): Promise<Contexto> {
  exigirSchemaPermitido(schema);

  const usuarios = await db.usuario.findMany({
    where: { activo: true, role: { in: ["ADMIN", "RECEPCION", ...ROLES_MECANICO] } },
    select: { id: true, nombre: true, role: true, sedes: { select: { sedeId: true } } },
  });
  const mecanicos = usuarios
    .filter((u) => (ROLES_MECANICO as readonly string[]).includes(u.role))
    .map((u) => ({ id: u.id, nombre: u.nombre, sedeIds: u.sedes.map((s) => s.sedeId) }));
  if (mecanicos.length === 0) throw new Error("No hay ningún mecánico activo en el taller");
  const admin = usuarios.find((u) => u.role === "ADMIN");
  if (!admin) throw new Error("No hay ningún usuario ADMIN activo");
  const recepcion = usuarios.find((u) => u.role === "RECEPCION");

  const [sedes, repuestos, servicios, proveedores, categoriasGasto, clientes, vehiculos] = await Promise.all([
    db.sede.findMany({ select: { id: true, nombre: true } }),
    db.repuesto.findMany({
      select: {
        id: true, nombre: true, precioCompra: true, precioVenta: true,
        stockActual: true, stockMinimo: true, bodegaId: true, proveedorId: true,
      },
    }),
    db.servicio.findMany({ select: { id: true, nombre: true } }),
    db.proveedor.findMany({ select: { id: true, nombre: true } }),
    db.categoriaGasto.findMany({ select: { id: true, nombre: true } }),
    db.cliente.findMany({
      select: { id: true, nombre: true, vehiculos: { select: { id: true, placa: true } } },
    }),
    db.vehiculo.findMany({ select: { placa: true } }),
  ]);

  const protegidas: readonly string[] = PLACAS_PROTEGIDAS;
  return {
    schema,
    actorId: admin.id,
    recepcionistaId: recepcion?.id ?? admin.id,
    sedes,
    mecanicos,
    repuestos: repuestos.map((r) => ({
      ...r, precioCompra: aNumero(r.precioCompra), precioVenta: aNumero(r.precioVenta),
    })),
    servicios,
    proveedores,
    categoriasGasto,
    clientesExistentes: clientes
      .filter((c) => c.nombre !== CLIENTE_PROTEGIDO)
      .map((c) => ({
        id: c.id,
        vehiculoIds: c.vehiculos.filter((v) => !protegidas.includes(v.placa)).map((v) => v.id),
      })),
    placasOcupadas: new Set(vehiculos.map((v) => v.placa)),
  };
}
