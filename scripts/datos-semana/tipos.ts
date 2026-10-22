export type Volumen = "bajo" | "medio" | "alto";

export interface Respuestas {
  desde: string;              // "YYYY-MM-DD"
  hasta: string;              // "YYYY-MM-DD", <= hoy
  sedeIds: string[];          // una o todas
  clientesNuevos: number;     // 0 = usar existentes
  volumen: Volumen;
  liquidar: boolean;
}

/** Clave estable de una orden dentro del plan, para encadenar eventos entre días. */
export type ClaveOrden = string; // p. ej. "o-2026-10-20-s1-3"

export type Evento =
  | { tipo: "abrirCaja"; hora: string }
  | { tipo: "cerrarCaja"; hora: string; diferencia: number }
  | { tipo: "crearCliente"; hora: string }
  | { tipo: "cita"; hora: string; estado: "PROGRAMADA" | "CONFIRMADA" | "COMPLETADA" | "CANCELADA"; ordenClave?: ClaveOrden }
  | { tipo: "cotizacion"; hora: string; destino: "ENVIADA" | "APROBADA" | "RECHAZADA" | "VENCIDA"; ordenClave?: ClaveOrden }
  | { tipo: "crearOrden"; hora: string; clave: ClaveOrden; borrador: boolean; conAnticipo: boolean }
  | { tipo: "terminarOrden"; hora: string; clave: ClaveOrden }
  | { tipo: "entregarOrden"; hora: string; clave: ClaveOrden; pago: "COMPLETO" | "PARCIAL" | "PENDIENTE"; garantia: boolean }
  | { tipo: "anularOrden"; hora: string; clave: ClaveOrden }
  | { tipo: "ventaMostrador"; hora: string; fiada: boolean; devolucion: boolean }
  | { tipo: "gasto"; hora: string; efectivo: boolean }
  | { tipo: "gastosRecurrentes"; hora: string }
  | { tipo: "pedidoCompra"; hora: string; recibir: boolean }
  | { tipo: "abonoProveedor"; hora: string }
  | { tipo: "liquidacion"; hora: string };

export interface PlanDia {
  fecha: string;    // "YYYY-MM-DD"
  sedeId: string;
  eventos: Evento[]; // ordenados por hora "HH:MM"
}
