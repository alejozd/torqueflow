import { crearAzar, type Azar } from "./azar";
import type { Contexto, TenantDb } from "./contexto";
import { registrarCita } from "./citas";
import { registrarAbonoProveedor, registrarPedidoCompra } from "./compras";
import { registrarCotizacion } from "./cotizaciones";
import { crearCliente } from "./clientes";
import { registrarGasto, registrarGastosRecurrentes } from "./gastos";
import { registrarVentaMostrador } from "./mostrador";
import { abrirCaja, cerrarCaja } from "./dinero";
import { anularOrden, crearOrden, entregarOrden, terminarOrden } from "./ordenes";
import type { ClaveOrden, Evento, PlanDia } from "./tipos";

export type TenantTx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

export interface EstadoEjecucion {
  ordenes: Map<ClaveOrden, string>;   // clave del plan → id real
  cajaAbierta: Map<string, string>;   // sedeId → id de CajaSesion abierta
  creados: Record<string, number>;    // para el resumen final
  clientesCreados: { clienteId: string; vehiculoIds: string[]; creadoEn: Date }[]; // creados por el script
  clientesUsados: Set<string>;        // clientes creados que ya se asignaron a un evento
  citasPorOrden: Map<ClaveOrden, string>; // cita COMPLETADA → se enlaza al crear su orden
  anticiposPendientes: ClaveOrden[];  // órdenes con anticipo por registrar (Task 7)
  vendidos?: Map<string, number>;     // repuestoId → unidades netas vendidas en el mostrador
  ultimoPedidoCompra?: Evento;        // el último pedidoCompra del plan (no reponer dos de los más vendidos)
  entradasRecibidas?: string[];       // entradas de pedidos recibidos por el script: sus deudas son las únicas que se abonan
}

export type Manejador = (
  tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, dia: PlanDia, evento: Evento, az: Azar,
) => Promise<void>;

/** Un día completo sobre el enlace remoto supera los 5 s por defecto de Prisma. */
const TIEMPO_MAXIMO_TRANSACCION = 120_000;
const ESPERA_MAXIMA_TRANSACCION = 10_000;

/** Se llena en las tareas 5 a 10. */
export const MANEJADORES: Partial<Record<Evento["tipo"], Manejador>> = {
  abrirCaja, cerrarCaja, crearCliente, cita: registrarCita, cotizacion: registrarCotizacion, crearOrden, terminarOrden, entregarOrden, anularOrden,
  ventaMostrador: registrarVentaMostrador, gasto: registrarGasto, gastosRecurrentes: registrarGastosRecurrentes,
  pedidoCompra: registrarPedidoCompra, abonoProveedor: registrarAbonoProveedor,
};

export async function ejecutarPlan(
  db: TenantDb, ctx: Contexto, plan: PlanDia[], semilla: number, aviso: (texto: string) => void,
): Promise<EstadoEjecucion> {
  const estado: EstadoEjecucion = { ordenes: new Map(), cajaAbierta: new Map(), creados: {},
    clientesCreados: [], clientesUsados: new Set(), citasPorOrden: new Map(), anticiposPendientes: [] };
  estado.ultimoPedidoCompra = plan.flatMap((d) => d.eventos).filter((e) => e.tipo === "pedidoCompra").at(-1);
  const az = crearAzar(semilla);
  for (const dia of plan) {
    const sede = ctx.sedes.find((s) => s.id === dia.sedeId)?.nombre ?? dia.sedeId;
    aviso(`Creando ${dia.fecha} (sede ${sede})...`);
    let actual = "";
    try {
      await db.$transaction(async (tx) => {
        for (const evento of dia.eventos) {
          actual = evento.tipo;
          const manejador = MANEJADORES[evento.tipo];
          if (manejador) {
            await manejador(tx, ctx, estado, dia, evento, az);
          } else {
            const clave = `omitido:${evento.tipo}`;
            estado.creados[clave] = (estado.creados[clave] ?? 0) + 1;
          }
        }
      }, { timeout: TIEMPO_MAXIMO_TRANSACCION, maxWait: ESPERA_MAXIMA_TRANSACCION });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      throw new Error(`Falló el ${dia.fecha} (sede ${sede}) en "${actual}": ${mensaje}`);
    }
  }
  return estado;
}

/**
 * Quita del plan lo que quedaría en el futuro: en el día `hoy`, los eventos con hora posterior a
 * `horaActual` (abrirCaja se conserva), y todo evento que dependa de una orden descartada.
 */
export function recortarAlPresente(plan: PlanDia[], hoy: string, horaActual: string): PlanDia[] {
  const descartadas = new Set<ClaveOrden>();
  const recortado = plan.map((dia) => {
    if (dia.fecha !== hoy) return dia;
    const eventos = dia.eventos.filter((e) => {
      const conserva = e.tipo === "abrirCaja" || e.hora <= horaActual;
      if (!conserva && e.tipo === "crearOrden") descartadas.add(e.clave);
      return conserva;
    });
    return { ...dia, eventos };
  });
  if (descartadas.size === 0) return recortado;
  return recortado.map((dia) => ({
    ...dia,
    eventos: dia.eventos.filter((e) => {
      const clave = "ordenClave" in e ? e.ordenClave : "clave" in e ? e.clave : undefined;
      return clave === undefined || !descartadas.has(clave);
    }),
  }));
}
