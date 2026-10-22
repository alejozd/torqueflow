import { MARCA } from "./contexto";
import { elegirClienteYVehiculo } from "./clientes";
import type { Manejador } from "./ejecutor";
import { instante, sumarDias } from "./fechas";

const MOTIVOS = [
  "Cambio de aceite y filtros", "Revisión de frenos", "Alineación y balanceo", "Diagnóstico de ruidos",
  "Mantenimiento de 10.000 km", "Revisión preventiva", "Cambio de llantas", "Falla en el arranque",
] as const;

/** Siguiente día laborable (lunes a sábado) a `n` días de `fecha`. */
function diaAgenda(fecha: string, n: number): string {
  let dia = sumarDias(fecha, n);
  if (new Date(`${dia}T00:00:00Z`).getUTCDay() === 0) dia = sumarDias(dia, 1);
  return dia;
}

/**
 * createCitaAction + cambiarEstadoCitaAction. Las citas completadas son de hoy (el cliente ya
 * vino); las demás se agendan 1 a 5 días después. El estado se escribe directo en la creación.
 */
export const registrarCita: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "cita") return;
  const creada = instante(dia.fecha, evento.hora);
  const { clienteId, vehiculoId } = await elegirClienteYVehiculo(tx, ctx, estado, az, dia.fecha, creada);
  const hoy = evento.estado === "COMPLETADA";
  const fechaHora = hoy ? creada : instante(diaAgenda(dia.fecha, az.entero(1, 5)), `${String(az.entero(8, 16)).padStart(2, "0")}:00`);
  const cita = await tx.cita.create({
    data: {
      clienteId,
      vehiculoId,
      sedeId: dia.sedeId,
      fechaHora,
      estado: evento.estado,
      motivo: az.elegir(MOTIVOS),
      notas: MARCA,
      creadoPorId: ctx.recepcionistaId,
      createdAt: creada,
      updatedAt: creada,
    },
  });
  if (evento.ordenClave) estado.citasPorOrden.set(evento.ordenClave, cita.id);
  estado.creados.cita = (estado.creados.cita ?? 0) + 1;
};
