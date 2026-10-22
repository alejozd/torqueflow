import { FIGURAS } from "@/lib/danos/figuras";
import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";
import { isValidEstadoTransition } from "@/lib/orden/estado-transitions";
import type { Azar } from "./azar";
import { MARCA, type Contexto } from "./contexto";
import { elegirClienteYVehiculo } from "./clientes";
import type { EstadoEjecucion, Manejador, TenantTx } from "./ejecutor";
import { instante } from "./fechas";
import type { ClaveOrden } from "./tipos";

const SINTOMAS = [
  "Ruido al frenar", "Cambio de aceite y filtros", "Luz de motor encendida", "Vibración en el volante",
  "Se calienta el motor", "Revisión antes de viaje", "Dificultad para arrancar", "Fuga de líquido",
  "Aire acondicionado no enfría", "Mantenimiento de 20.000 km",
] as const;
const TRABAJOS = [
  "Cambio de aceite y filtro", "Cambio de pastillas de freno", "Alineación y balanceo", "Diagnóstico con escáner",
  "Cambio de correa", "Revisión de suspensión", "Lavado de inyectores", "Cambio de bujías", "Mantenimiento del aire acondicionado",
] as const;
const COMBUSTIBLES = ["VACIO", "CUARTO", "MEDIO", "TRES_CUARTOS", "LLENO"] as const;
const TIPOS_DANIO = ["GOLPE", "RAYON", "ROTURA", "FALTANTE", "OXIDO"] as const;
const ESTADOS_DVI = ["OK", "OK", "OK", "OK", "ATENCION", "ATENCION", "CRITICO", "NO_APLICA"] as const;

const sumar = (estado: EstadoEjecucion, clave: string, n = 1) => {
  estado.creados[clave] = (estado.creados[clave] ?? 0) + n;
};

function claveDesconocida(evento: string, clave: ClaveOrden): Error {
  return new Error(`${evento}: la orden "${clave}" no existe en este plan (no se creó antes)`);
}

/** Mecánicos de la sede; si ninguno la tiene, todos. */
function mecanicosDeLaSede(ctx: Contexto, sedeId: string) {
  const deLaSede = ctx.mecanicos.filter((m) => m.sedeIds.includes(sedeId));
  return deLaSede.length > 0 ? deLaSede : ctx.mecanicos;
}

/** createOrdenDesdeVehiculoAction: la orden nace en BORRADOR con sus síntomas. */
async function abrirOrden(
  tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, az: Azar,
  sedeId: string, clienteId: string, vehiculoId: string, mecanicoId: string, creada: Date,
): Promise<string> {
  const orden = await tx.ordenTrabajo.create({
    data: {
      clienteId, vehiculoId, sedeId,
      creadoPorId: ctx.recepcionistaId,
      mecanicoId,
      sintomas: `${MARCA} ${az.elegir(SINTOMAS)}`,
      createdAt: creada,
      updatedAt: creada,
    },
  });
  sumar(estado, "orden");
  return orden.id;
}

/** guardarRecepcionAction + agregarDanioAction: kilometraje creciente, combustible y 0 a 2 daños. */
async function registrarRecepcion(
  tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, az: Azar,
  ordenId: string, vehiculoId: string, creada: Date,
): Promise<void> {
  const [vehiculo, ultima] = await Promise.all([
    tx.vehiculo.findUnique({ where: { id: vehiculoId }, select: { kilometraje: true } }),
    tx.ordenTrabajo.findFirst({
      where: { vehiculoId, kilometrajeIngreso: { not: null } },
      orderBy: { kilometrajeIngreso: "desc" },
      select: { kilometrajeIngreso: true },
    }),
  ]);
  const base = Math.max(vehiculo?.kilometraje ?? 0, ultima?.kilometrajeIngreso ?? 0);
  await tx.ordenTrabajo.update({
    where: { id: ordenId },
    data: { kilometrajeIngreso: base + az.entero(50, 2500), nivelCombustible: az.elegir(COMBUSTIBLES), updatedAt: creada },
  });

  const zonas = FIGURAS.CARRO.zonas.map((z) => z.zona);
  const marcados = new Set<string>();
  for (let i = az.entero(0, 2); i > 0; i--) {
    const zona = az.elegir(zonas);
    const tipo = az.elegir(TIPOS_DANIO);
    if (marcados.has(`${zona}/${tipo}`)) continue; // @@unique([ordenId, zona, tipo])
    marcados.add(`${zona}/${tipo}`);
    await tx.danioOrden.create({
      data: { ordenId, zona, tipo, nota: MARCA, creadoPorId: ctx.recepcionistaId, createdAt: creada },
    });
    sumar(estado, "danio");
  }
}

/** updateDviChecklistAction: marca cada ítem activo (sin fotos). */
async function registrarChecklist(
  tx: TenantTx, estado: EstadoEjecucion, az: Azar, ordenId: string, mecanicoId: string, creada: Date,
): Promise<void> {
  const activos = await tx.dviChecklistItem.findMany({ where: { activo: true } });
  const checklist: Record<string, string> = {};
  for (const item of activos) checklist[item.key] = az.elegir(ESTADOS_DVI);
  await tx.dvi.create({ data: { ordenId, checklist, creadoPorId: mecanicoId, createdAt: creada, updatedAt: creada } });
  sumar(estado, "dvi");
}

/**
 * addItemOrdenAction: 1 a 3 repuestos de la sede con stock. La acción no toca `stockActual`
 * (lo descuenta `crearFacturaAction` al facturar), así que aquí solo se reserva en `ctx` para
 * que ninguna orden pida más de lo que habrá al facturar; `anularOrden` devuelve la reserva.
 */
async function agregarRepuestos(
  tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, az: Azar, ordenId: string, sedeId: string, creada: Date,
): Promise<void> {
  const bodegas = new Set((await tx.bodega.findMany({ where: { sedeId }, select: { id: true } })).map((b) => b.id));
  const disponibles = ctx.repuestos.filter((r) => bodegas.has(r.bodegaId) && r.stockActual >= 1);
  for (let i = az.entero(1, 3); i > 0 && disponibles.length > 0; i--) {
    const repuesto = disponibles.splice(az.entero(0, disponibles.length - 1), 1)[0]!;
    const cantidad = az.entero(1, Math.min(3, repuesto.stockActual));
    if (repuesto.stockActual < cantidad) continue; // misma guarda que el descuento al facturar
    repuesto.stockActual -= cantidad;
    await tx.itemOrden.create({
      data: {
        ordenId, repuestoId: repuesto.id, descripcion: repuesto.nombre,
        cantidad, precioUnitario: repuesto.precioVenta, createdAt: creada,
      },
    });
    sumar(estado, "itemOrden");
  }
}

/** addManoDeObraAction: 1 a 3 líneas repartidas entre los mecánicos de la sede. */
async function agregarManoDeObra(
  tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, az: Azar, ordenId: string, sedeId: string, creada: Date,
): Promise<void> {
  const mecanicos = mecanicosDeLaSede(ctx, sedeId);
  for (let i = az.entero(1, 3); i > 0; i--) {
    await tx.manoDeObra.create({
      data: {
        ordenId,
        descripcion: `${MARCA} ${az.elegir(TRABAJOS)}`,
        valor: az.entero(4, 30) * 5000,
        mecanicoId: az.elegir(mecanicos).id,
        createdAt: creada,
      },
    });
    sumar(estado, "manoDeObra");
  }
}

/** updateEstadoOrdenAction (sin notificación): comprueba la transición y escribe condicional al estado leído. */
async function cambiarEstado(
  tx: TenantTx, ctx: Contexto, evento: string, ordenId: string, destino: "TERMINADA" | "ANULADA", cuando: Date,
): Promise<void> {
  const orden = await tx.ordenTrabajo.findUnique({ where: { id: ordenId }, select: { estado: true } });
  if (!orden) throw new Error(`${evento}: la orden ${ordenId} ya no existe`);
  if (!isValidEstadoTransition(orden.estado, destino)) {
    throw new Error(`${evento}: no se puede cambiar de ${orden.estado} a ${destino}`);
  }
  const { count } = await tx.ordenTrabajo.updateMany({
    where: { id: ordenId, estado: orden.estado },
    data: { estado: destino, updatedAt: cuando, ...(destino === "ANULADA" ? { anuladaAt: cuando } : {}) },
  });
  if (count === 0) throw new Error(`${evento}: el estado de la orden ${ordenId} cambió durante la ejecución`);
  if (destino === "ANULADA") {
    await registrarEventoAuditoria(tx, {
      tipo: "ORDEN_ANULAR",
      actorId: ctx.actorId,
      entidadTipo: "OrdenTrabajo",
      entidadId: ordenId,
      detalle: { estadoAnterior: orden.estado },
    });
  }
}

export const crearOrden: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "crearOrden") return;
  const creada = instante(dia.fecha, evento.hora);
  const { clienteId, vehiculoId } = await elegirClienteYVehiculo(tx, ctx, estado, az, dia.fecha, creada);
  const mecanicoId = az.elegir(mecanicosDeLaSede(ctx, dia.sedeId)).id;
  const ordenId = await abrirOrden(tx, ctx, estado, az, dia.sedeId, clienteId, vehiculoId, mecanicoId, creada);
  estado.ordenes.set(evento.clave, ordenId);

  await registrarRecepcion(tx, ctx, estado, az, ordenId, vehiculoId, creada);
  if (!evento.borrador) {
    // Trabajo en el taller unos minutos después de la recepción.
    const trabajo = new Date(creada.getTime() + az.entero(5, 40) * 60_000);
    await registrarChecklist(tx, estado, az, ordenId, mecanicoId, trabajo);
    await agregarRepuestos(tx, ctx, estado, az, ordenId, dia.sedeId, trabajo);
    await agregarManoDeObra(tx, ctx, estado, az, ordenId, dia.sedeId, trabajo);
    // BORRADOR → EN_PROCESO (updateEstadoOrdenAction); la orden es nueva, no hay estado que verificar.
    await tx.ordenTrabajo.update({ where: { id: ordenId }, data: { estado: "EN_PROCESO", updatedAt: trabajo } });
  }
  if (evento.conAnticipo) estado.anticiposPendientes.push(evento.clave);
};

export const terminarOrden: Manejador = async (tx, ctx, estado, dia, evento) => {
  if (evento.tipo !== "terminarOrden") return;
  const ordenId = estado.ordenes.get(evento.clave);
  if (!ordenId) throw claveDesconocida("terminarOrden", evento.clave);
  await cambiarEstado(tx, ctx, "terminarOrden", ordenId, "TERMINADA", instante(dia.fecha, evento.hora));
};

export const anularOrden: Manejador = async (tx, ctx, estado, dia, evento) => {
  if (evento.tipo !== "anularOrden") return;
  const ordenId = estado.ordenes.get(evento.clave);
  if (!ordenId) throw claveDesconocida("anularOrden", evento.clave);
  await cambiarEstado(tx, ctx, "anularOrden", ordenId, "ANULADA", instante(dia.fecha, evento.hora));
  // La acción no mueve inventario; aquí solo se libera lo que esta orden tenía reservado en ctx.
  const items = await tx.itemOrden.findMany({ where: { ordenId }, select: { repuestoId: true, cantidad: true } });
  for (const item of items) {
    const repuesto = item.repuestoId ? ctx.repuestos.find((r) => r.id === item.repuestoId) : undefined;
    if (repuesto) repuesto.stockActual += item.cantidad;
  }
};
