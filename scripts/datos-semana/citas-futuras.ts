import { getTenantDb } from "@/lib/db/tenant-client";
import { crearAzar, type Azar } from "./azar";
import { MOTIVOS } from "./citas";
import { elegirClienteYVehiculo } from "./clientes";
import { cargarContexto, exigirSchemaPermitido, MARCA, SCHEMA_PERMITIDO, type Contexto, type TenantDb } from "./contexto";
import type { EstadoEjecucion } from "./ejecutor";
import { diasDelRango, horaBogota, hoyBogota, instante, sumarDias } from "./fechas";
import { confirmar, crearPregunton, esFechaReal, preguntarHasta, type Pregunton } from "./preguntas";

const MAX_DIAS = 31;
const MAX_POR_DIA = 20;
// Misma grilla que el selector de citas: 7:00 a 18:00 cada 30 minutos.
const APERTURA = 7 * 60;
const CIERRE = 18 * 60;
const PASO = 30;

export interface CitaFutura {
  fecha: string;
  hora: string;
  sedeId: string;
  estado: "PROGRAMADA" | "CONFIRMADA";
}

/** Mensaje de error, o null si el rango (hoy en adelante) es válido. */
export function validarRangoFuturo(desde: string, hasta: string, hoy: string): string | null {
  if (!esFechaReal(desde) || !esFechaReal(hasta)) return "Use el formato AAAA-MM-DD";
  if (desde < hoy) return "Las citas futuras empiezan hoy o después";
  if (desde > hasta) return "La fecha desde no puede ser posterior a hasta";
  if (hasta > sumarDias(desde, MAX_DIAS - 1)) return `El rango no puede pasar de ${MAX_DIAS} días`;
  return null;
}

/** Horas "HH:MM" de la grilla del día; si es hoy, solo las que aún no pasaron. */
export function franjasDelDia(fecha: string, hoy: string, ahora: string): string[] {
  const [h, m] = ahora.split(":").map(Number);
  const minimo = fecha === hoy ? h * 60 + m : -1;
  const franjas: string[] = [];
  for (let min = APERTURA; min < CIERRE; min += PASO) {
    if (min > minimo) franjas.push(`${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
  }
  return franjas;
}

/** `porDia` citas por sede y día (sin domingos), en franjas distintas y ordenadas. */
export function planCitasFuturas(
  desde: string, hasta: string, sedeIds: string[], porDia: number, hoy: string, ahora: string, az: Azar,
): CitaFutura[] {
  const plan: CitaFutura[] = [];
  for (const fecha of diasDelRango(desde, hasta)) {
    for (const sedeId of sedeIds) {
      const libres = [...franjasDelDia(fecha, hoy, ahora)];
      const elegidas: string[] = [];
      while (elegidas.length < porDia && libres.length > 0) {
        elegidas.push(libres.splice(az.entero(0, libres.length - 1), 1)[0]);
      }
      for (const hora of elegidas.sort()) {
        plan.push({ fecha, hora, sedeId, estado: az.probabilidad(0.4) ? "CONFIRMADA" : "PROGRAMADA" });
      }
    }
  }
  return plan;
}

/** createCitaAction: citas agendadas a futuro, creadas ahora (createdAt por defecto). */
export async function crearCitasFuturas(
  db: TenantDb, ctx: Contexto, plan: CitaFutura[], az: Azar,
): Promise<Record<string, number>> {
  const estado: EstadoEjecucion = {
    ordenes: new Map(), cajaAbierta: new Map(), creados: {},
    clientesCreados: [], clientesUsados: new Set(), citasPorOrden: new Map(), anticiposPendientes: [],
  };
  await db.$transaction(async (tx) => {
    for (const c of plan) {
      const { clienteId, vehiculoId } = await elegirClienteYVehiculo(tx, ctx, estado, az, c.fecha);
      await tx.cita.create({
        data: {
          clienteId,
          vehiculoId,
          sedeId: c.sedeId,
          fechaHora: instante(c.fecha, c.hora),
          estado: c.estado,
          motivo: az.elegir(MOTIVOS),
          notas: MARCA,
          creadoPorId: ctx.recepcionistaId,
        },
      });
      estado.creados.cita = (estado.creados.cita ?? 0) + 1;
    }
  }, { timeout: 60_000 });
  return estado.creados;
}

async function preguntar(p: Pregunton, ctx: Contexto, hoy: string) {
  const sugerido = sumarDias(hoy, 6);
  let rango: { desde: string; hasta: string } | null = null;
  let error = "";
  while (!rango) {
    const desde = (await p.preguntar(`${error}Desde [${hoy}]: `)).trim() || hoy;
    const hasta = (await p.preguntar(`Hasta [${sugerido}]: `)).trim() || sugerido;
    const mensaje = validarRangoFuturo(desde, hasta, hoy);
    if (mensaje) error = `${mensaje}\n`;
    else rango = { desde, hasta };
  }

  const todas = ctx.sedes.length + 1;
  const lista = ctx.sedes.map((s, i) => `  ${i + 1}) ${s.nombre}`).concat(`  ${todas}) Todas`);
  const sedeIds = await preguntarHasta(p, `Sede:\n${lista.join("\n")}\nElija [${todas}]: `, (r) => {
    const n = r === "" ? todas : Number(r);
    if (!Number.isInteger(n) || n < 1 || n > todas) return "Opción no válida";
    return { valor: n === todas ? ctx.sedes.map((s) => s.id) : [ctx.sedes[n - 1].id] };
  });

  const porDia = await preguntarHasta(p, "Citas por día y sede [3]: ", (r) => {
    const n = r === "" ? 3 : Number(r);
    if (!Number.isInteger(n) || n < 1) return "Opción no válida";
    return n > MAX_POR_DIA ? `Máximo ${MAX_POR_DIA} por día` : { valor: n };
  });

  return { ...rango, sedeIds, porDia };
}

export async function mainCitasFuturas(): Promise<void> {
  exigirSchemaPermitido(SCHEMA_PERMITIDO);
  const db = getTenantDb(SCHEMA_PERMITIDO);
  const preguntas = crearPregunton();
  const semilla = 1 + Math.floor(Math.random() * 999_999);
  try {
    const ctx = await cargarContexto(db, SCHEMA_PERMITIDO);
    const hoy = hoyBogota();
    const r = await preguntar(preguntas, ctx, hoy);
    const az = crearAzar(semilla);
    const plan = planCitasFuturas(r.desde, r.hasta, r.sedeIds, r.porDia, hoy, horaBogota(), az);
    if (plan.length === 0) {
      console.log("No quedan franjas libres en ese rango, no se creó nada.");
      return;
    }
    const resumen = `Se crearán ${plan.length} citas futuras en ${SCHEMA_PERMITIDO} (${r.desde} a ${r.hasta}, sin domingos).`;
    if (!(await confirmar(preguntas, resumen))) {
      console.log("Cancelado, no se creó nada.");
      return;
    }
    const creados = await crearCitasFuturas(db, ctx, plan, az);
    console.log("Listo. Registros creados:");
    for (const [tipo, n] of Object.entries(creados)) console.log(`  ${tipo}: ${n}`);
  } finally {
    preguntas.cerrar();
  }
}
