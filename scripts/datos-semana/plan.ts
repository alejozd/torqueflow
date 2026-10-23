import { crearAzar, type Azar } from "./azar";
import { diasDelRango } from "./fechas";
import type { ClaveOrden, Evento, PlanDia, Respuestas, Volumen } from "./tipos";

export const VOLUMENES: Record<Volumen, { ordenes: number; citas: number; cotizaciones: number; ventas: number; gastos: number }> = {
  bajo: { ordenes: 3, citas: 2, cotizaciones: 1, ventas: 2, gastos: 1 },
  medio: { ordenes: 6, citas: 4, cotizaciones: 3, ventas: 4, gastos: 2 },
  alto: { ordenes: 10, citas: 6, cotizaciones: 5, ventas: 8, gastos: 4 },
};

// Minutos desde medianoche.
const ABRIR = [450, 470] as const; // 07:30-07:50
const CERRAR = [1050, 1080] as const; // 17:30-18:00
const CLIENTES = [480, 505] as const; // antes de la primera orden
const CREAR_ORDEN = [510, 900] as const; // 08:30-15:00
const TERMINAR_HASTA = 990; // 16:30, deja sitio para entregar el mismo día
const FIN_JORNADA = 1035; // 17:15, última hora de cualquier evento operativo
const LIQUIDACION = 1040; // 17:20, entre la última entrega y el cierre
const MIN_OPERATIVA = 480;
const SEPARACION = 20; // minutos mínimos entre etapas de una misma orden

function hhmm(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

interface OrdenDelDia {
  clave: ClaveOrden;
  minuto: number;
}

/** Elige y quita una orden candidata al azar, o undefined si no queda ninguna. */
function tomar(candidatas: OrdenDelDia[], az: Azar): OrdenDelDia | undefined {
  if (candidatas.length === 0) return undefined;
  return candidatas.splice(az.entero(0, candidatas.length - 1), 1)[0];
}

export function armarPlan(respuestas: Respuestas, semilla: number, hoy: string): PlanDia[] {
  const az = crearAzar(semilla);
  const v = VOLUMENES[respuestas.volumen];
  const hasta = respuestas.hasta < hoy ? respuestas.hasta : hoy;
  const dias = diasDelRango(respuestas.desde, hasta);
  const sedes = respuestas.sedeIds;
  if (dias.length === 0 || sedes.length === 0) return [];

  // Eventos de cada (día, sede) sin abrir/cerrar caja; los ciclos de órdenes escriben en días posteriores.
  const cuerpo = new Map<string, Evento[]>();
  for (const f of dias) for (const s of sedes) cuerpo.set(`${f}|${s}`, []);
  const poner = (dia: number, sede: string, e: Evento) => cuerpo.get(`${dias[dia]}|${sede}`)!.push(e);
  const hora = (min: number, max: number) => hhmm(az.entero(min, max));

  dias.forEach((fecha, d) => {
    sedes.forEach((sede) => {
      // Órdenes: las que no son borrador ni anulada pueden originarse en una cita o cotización.
      const candidatas: OrdenDelDia[] = [];
      for (let n = 1; n <= v.ordenes; n++) {
        const clave = `o-${fecha}-${sede}-${n}`;
        const minuto = az.entero(...CREAR_ORDEN);
        const r = az.azar();
        const borrador = r < 0.05;
        const anulada = !borrador && r < 0.1;
        poner(d, sede, { tipo: "crearOrden", hora: hhmm(minuto), clave, borrador, conAnticipo: !borrador && az.probabilidad(0.15) });
        if (borrador) continue;
        if (anulada) {
          poner(d, sede, { tipo: "anularOrden", hora: hora(minuto + SEPARACION, FIN_JORNADA), clave });
          continue;
        }
        candidatas.push({ clave, minuto });

        const dTerminar = d + az.entero(0, 2);
        if (dTerminar >= dias.length) continue; // el ciclo no cabe: queda en proceso
        const minTerminar = az.entero(dTerminar === d ? minuto + SEPARACION : MIN_OPERATIVA, TERMINAR_HASTA);
        poner(dTerminar, sede, { tipo: "terminarOrden", hora: hhmm(minTerminar), clave });

        const dEntregar = dTerminar + az.entero(0, 2);
        if (dEntregar >= dias.length) continue; // queda terminada
        const minEntregar = az.entero(dEntregar === dTerminar ? minTerminar + SEPARACION : MIN_OPERATIVA, FIN_JORNADA);
        const r2 = az.azar();
        poner(dEntregar, sede, {
          tipo: "entregarOrden",
          hora: hhmm(minEntregar),
          clave,
          pago: r2 < 0.7 ? "COMPLETO" : r2 < 0.85 ? "PARCIAL" : "PENDIENTE",
          garantia: az.probabilidad(0.2),
        });
      }

      // Citas y cotizaciones: si no queda orden candidata para enlazar, bajan a un estado sin orden.
      for (let n = 0; n < v.citas; n++) {
        const r = az.azar();
        let estado: "PROGRAMADA" | "CONFIRMADA" | "COMPLETADA" | "CANCELADA" =
          r < 0.6 ? "COMPLETADA" : r < 0.8 ? "CONFIRMADA" : r < 0.9 ? "PROGRAMADA" : "CANCELADA";
        const orden = estado === "COMPLETADA" ? tomar(candidatas, az) : undefined;
        if (estado === "COMPLETADA" && !orden) estado = "CONFIRMADA";
        poner(d, sede, orden
          ? { tipo: "cita", hora: hora(MIN_OPERATIVA, orden.minuto - 10), estado, ordenClave: orden.clave }
          : { tipo: "cita", hora: hora(MIN_OPERATIVA, 960), estado });
      }
      for (let n = 0; n < v.cotizaciones; n++) {
        const r = az.azar();
        let destino: "ENVIADA" | "APROBADA" | "RECHAZADA" | "VENCIDA" =
          r < 0.4 ? "APROBADA" : r < 0.7 ? "ENVIADA" : r < 0.85 ? "RECHAZADA" : "VENCIDA";
        const orden = destino === "APROBADA" ? tomar(candidatas, az) : undefined;
        if (destino === "APROBADA" && !orden) destino = "ENVIADA";
        poner(d, sede, orden
          ? { tipo: "cotizacion", hora: hora(MIN_OPERATIVA, orden.minuto - 10), destino, ordenClave: orden.clave }
          : { tipo: "cotizacion", hora: hora(MIN_OPERATIVA, 960), destino });
      }

      for (let n = 0; n < v.ventas; n++) {
        poner(d, sede, { tipo: "ventaMostrador", hora: hora(MIN_OPERATIVA, FIN_JORNADA), fiada: az.probabilidad(0.2), devolucion: az.probabilidad(0.1) });
      }
      for (let n = 0; n < v.gastos; n++) {
        poner(d, sede, { tipo: "gasto", hora: hora(MIN_OPERATIVA, FIN_JORNADA), efectivo: az.probabilidad(0.6) });
      }
      if (d === 0) poner(d, sede, { tipo: "gastosRecurrentes", hora: hora(MIN_OPERATIVA, 540) });
      if (d % 2 === 0) poner(d, sede, { tipo: "pedidoCompra", hora: hora(MIN_OPERATIVA, 600), recibir: az.probabilidad(0.7) });
      if (d % 3 === 2) poner(d, sede, { tipo: "abonoProveedor", hora: hora(600, FIN_JORNADA) });
    });
  });

  // Clientes nuevos repartidos al azar entre días y sedes, antes de las órdenes.
  for (let i = 0; i < respuestas.clientesNuevos; i++) {
    poner(az.entero(0, dias.length - 1), sedes[az.entero(0, sedes.length - 1)]!, { tipo: "crearCliente", hora: hora(...CLIENTES) });
  }
  if (respuestas.liquidar) poner(dias.length - 1, sedes[0]!, { tipo: "liquidacion", hora: hhmm(LIQUIDACION) });

  const plan: PlanDia[] = [];
  dias.forEach((fecha) => {
    sedes.forEach((sedeId) => {
      const medio = cuerpo.get(`${fecha}|${sedeId}`)!.sort((a, b) => (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0));
      const eventos: Evento[] = [{ tipo: "abrirCaja", hora: hora(...ABRIR) }, ...medio];
      if (fecha !== hoy) {
        eventos.push({ tipo: "cerrarCaja", hora: hora(...CERRAR), diferencia: az.probabilidad(0.8) ? 0 : az.entero(-5000, 5000) });
      }
      plan.push({ fecha, sedeId, eventos });
    });
  });
  return plan;
}

export function contarEventos(plan: PlanDia[]): Record<Evento["tipo"], number> {
  const conteo: Record<Evento["tipo"], number> = {
    abrirCaja: 0, cerrarCaja: 0, crearCliente: 0, cita: 0, cotizacion: 0, crearOrden: 0, terminarOrden: 0,
    entregarOrden: 0, anularOrden: 0, ventaMostrador: 0, gasto: 0, gastosRecurrentes: 0, pedidoCompra: 0,
    abonoProveedor: 0, liquidacion: 0,
  };
  for (const dia of plan) for (const e of dia.eventos) conteo[e.tipo]++;
  return conteo;
}
