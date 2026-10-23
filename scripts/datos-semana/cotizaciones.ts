import { computeCotizacionTotales } from "@/lib/cotizacion/totales";
import { crearOrdenDesdeCotizacion } from "@/lib/cotizacion/orden-desde-cotizacion";
import type { Azar } from "./azar";
import { MARCA, type Contexto } from "./contexto";
import { elegirClienteYVehiculo } from "./clientes";
import type { EstadoEjecucion, Manejador, TenantTx } from "./ejecutor";
import { desfasar, instante, sumarDias } from "./fechas";

type Destino = "ENVIADA" | "APROBADA" | "RECHAZADA" | "VENCIDA";

const MOTIVOS = [
  "Cambio de aceite y filtros", "Revisión de frenos", "Alineación y balanceo", "Mantenimiento de 30.000 km",
  "Reparación de suspensión", "Cambio de correa de repartición", "Revisión del aire acondicionado", "Cambio de bujías",
] as const;
const TRABAJOS = [
  "Mano de obra: cambio de aceite", "Mano de obra: cambio de pastillas", "Mano de obra: alineación y balanceo",
  "Mano de obra: diagnóstico con escáner", "Mano de obra: revisión de suspensión", "Mano de obra: cambio de bujías",
] as const;
const CANALES = [
  { tipo: "WHATSAPP", texto: "Se envió la cotización por WhatsApp" },
  { tipo: "EMAIL", texto: "Se envió la cotización por correo" },
  { tipo: "LLAMADA", texto: "Se compartió la cotización en una llamada" },
] as const;
const MS_DIA = 86_400_000;

interface Linea {
  tipo: "REPUESTO" | "MANO_OBRA"; repuestoId: string | null; descripcion: string; cantidad: number; precioUnitario: number;
}

const sumar = (estado: EstadoEjecucion, clave: string, n = 1) => {
  estado.creados[clave] = (estado.creados[clave] ?? 0) + n;
};

/**
 * agregarRepuestoACotizacionAction + agregarItemLibreCotizacionAction + actualizarItemCotizacionAction:
 * 1 a 2 líneas de mano de obra y hasta 2 repuestos de la sede con existencias. Si la cotización se
 * aprueba, sus repuestos pasan a la orden: solo entonces se reservan en `ctx` (el descuento real
 * de inventario ocurre al facturar), igual que los repuestos que arma `crearOrden`.
 */
async function elegirLineas(
  tx: TenantTx, ctx: Contexto, az: Azar, sedeId: string, reservar: boolean,
): Promise<Linea[]> {
  const bodegas = new Set((await tx.bodega.findMany({ where: { sedeId }, select: { id: true } })).map((b) => b.id));
  const disponibles = ctx.repuestos.filter((r) => bodegas.has(r.bodegaId) && r.stockActual >= 1);
  const lineas: Linea[] = [];
  for (let i = az.entero(0, 2); i > 0 && disponibles.length > 0; i--) {
    const repuesto = disponibles.splice(az.entero(0, disponibles.length - 1), 1)[0]!;
    const cantidad = az.entero(1, Math.min(3, repuesto.stockActual));
    if (reservar) repuesto.stockActual -= cantidad;
    lineas.push({ tipo: "REPUESTO", repuestoId: repuesto.id, descripcion: repuesto.nombre, cantidad, precioUnitario: repuesto.precioVenta });
  }
  for (let i = az.entero(1, 2); i > 0; i--) {
    lineas.push({
      tipo: "MANO_OBRA", repuestoId: null, descripcion: az.elegir(TRABAJOS), cantidad: 1, precioUnitario: az.entero(4, 30) * 5000,
    });
  }
  return lineas;
}

/** registrarSeguimientoAction: una llamada o mensaje de seguimiento a la cotización. */
async function registrarSeguimiento(
  tx: TenantTx, estado: EstadoEjecucion, ctx: Contexto, cotizacionId: string,
  tipo: "LLAMADA" | "WHATSAPP" | "EMAIL", fecha: Date, resultado: string, proximoSeguimiento?: Date,
): Promise<void> {
  await tx.cotizacionSeguimiento.create({
    data: {
      cotizacionId, tipo, fecha, resultado,
      proximoSeguimiento: proximoSeguimiento ?? null,
      creadoPorId: ctx.recepcionistaId,
      createdAt: fecha,
    },
  });
  sumar(estado, "cotizacionSeguimiento");
}

/**
 * crearCotizacionAction + ítems + descuento + enviarCotizacionAction (sin enviar nada: solo el
 * estado ENVIADA y su vigencia) + aprobar/rechazar. VENCIDA queda como la dejaría el barrido de
 * `marcarVencidas`: ENVIADA con la vigencia ya pasada, vista como VENCIDA. Las aprobadas y
 * rechazadas se crearon unos días antes y se deciden en la hora del evento; las enviadas y las
 * vencidas se envían al crearlas (las vencidas, hace su vigencia más 1 a 3 días).
 */
export const registrarCotizacion: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "cotizacion") return;
  const destino: Destino = evento.destino;
  if (destino === "APROBADA" && !evento.ordenClave) {
    throw new Error("cotizacion APROBADA: el plan no trae la ordenClave de la orden que crea");
  }
  if (evento.ordenClave && estado.ordenes.has(evento.ordenClave)) {
    throw new Error(`cotizacion: la orden "${evento.ordenClave}" ya existe en este plan`);
  }

  const decision = instante(dia.fecha, evento.hora);
  const vigenciaVencida = az.elegir([3, 5, 7]);
  const diasAntes = destino === "VENCIDA" ? vigenciaVencida + az.entero(1, 3) : destino === "ENVIADA" ? 0 : az.entero(1, 3);
  const creada = diasAntes === 0 ? decision : instante(sumarDias(dia.fecha, -diasAntes), evento.hora);
  const enviada = desfasar(creada, az.entero(3, 20));

  const { clienteId, vehiculoId } = await elegirClienteYVehiculo(tx, ctx, estado, az, dia.fecha, creada);
  const motivo = az.elegir(MOTIVOS);
  const cotizacion = await tx.cotizacion.create({
    data: {
      clienteId, vehiculoId, sedeId: dia.sedeId,
      motivo: `${MARCA} ${motivo}`,
      creadoPorId: ctx.recepcionistaId,
      createdAt: creada, updatedAt: creada,
    },
  });
  sumar(estado, "cotizacion");

  const lineas = await elegirLineas(tx, ctx, az, dia.sedeId, destino === "APROBADA");
  for (const linea of lineas) {
    await tx.itemCotizacion.create({ data: { cotizacionId: cotizacion.id, ...linea, createdAt: creada } });
    sumar(estado, "itemCotizacion");
  }
  // actualizarDescuentoCotizacionAction + recomputeCotizacionTotales, con la misma función de src/lib.
  const descuentoPct = az.probabilidad(0.25) ? az.elegir([5, 10]) : 0;
  const totales = computeCotizacionTotales({ items: lineas, descuentoTipo: "PORCENTAJE", descuentoPct });
  await tx.cotizacion.update({
    where: { id: cotizacion.id },
    data: {
      ...(descuentoPct > 0 ? { descuentoTipo: "PORCENTAJE" as const, descuentoPct } : {}),
      subtotal: totales.subtotal, descuento: totales.descuento, iva: totales.iva, total: totales.total,
      updatedAt: creada,
    },
  });

  // enviarCotizacionAction: BORRADOR → ENVIADA con la vigencia en días. Una cotización que sigue
  // enviada debe vencer después de hoy; la vencida, antes del evento.
  const diasPasados = Math.ceil((Date.now() - enviada.getTime()) / MS_DIA);
  const vigenciaDias = destino === "VENCIDA" ? vigenciaVencida : Math.max(az.elegir([3, 5, 7, 10, 15]), diasPasados + 2);
  const validaHasta = new Date(enviada.getTime() + vigenciaDias * MS_DIA);
  await tx.cotizacion.update({
    where: { id: cotizacion.id },
    data: { estado: "ENVIADA", validaHasta, notas: null, updatedAt: enviada },
  });
  const canal = az.elegir(CANALES);
  await registrarSeguimiento(tx, estado, ctx, cotizacion.id, canal.tipo, desfasar(enviada, 2), canal.texto,
    destino === "ENVIADA" ? instante(sumarDias(dia.fecha, 2), "00:00") : undefined);

  if (destino === "ENVIADA") {
    if (az.probabilidad(0.4)) {
      await registrarSeguimiento(tx, estado, ctx, cotizacion.id, "LLAMADA", desfasar(enviada, az.entero(30, 90)),
        "Cliente dice que lo va a pensar", instante(sumarDias(dia.fecha, 3), "00:00"));
    }
  } else if (destino === "VENCIDA") {
    await registrarSeguimiento(tx, estado, ctx, cotizacion.id, "LLAMADA", new Date(enviada.getTime() + 2 * MS_DIA),
      "No contestó la llamada");
    // El barrido de vencidas solo cambia el estado.
    await tx.cotizacion.update({ where: { id: cotizacion.id }, data: { estado: "VENCIDA", updatedAt: validaHasta } });
  } else {
    if (az.probabilidad(0.5)) {
      await registrarSeguimiento(tx, estado, ctx, cotizacion.id, "LLAMADA", desfasar(decision, -30),
        destino === "APROBADA" ? "Cliente confirma que sigue adelante" : "Cliente dice que es muy costosa");
    }
    if (destino === "RECHAZADA") {
      // rechazarCotizacionAction
      await tx.cotizacion.update({ where: { id: cotizacion.id }, data: { estado: "RECHAZADA", updatedAt: decision } });
    } else {
      // aprobarCotizacionAction: la orden nace de la cotización; `crearOrden` la completa después.
      const orden = await crearOrdenDesdeCotizacion(
        tx,
        { id: cotizacion.id, clienteId, vehiculoId, sedeId: dia.sedeId, items: lineas.map((l) => ({ ...l, grupoKitId: null, grupoKitNombre: null, servicioId: null })) },
        ctx.recepcionistaId,
        { sintomas: `${MARCA} ${motivo}`, creada: decision },
      );
      estado.ordenes.set(evento.ordenClave!, orden.id);
      sumar(estado, "orden");
    }
  }
};
