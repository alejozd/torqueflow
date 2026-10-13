import type { HojaEscrita } from "@/lib/importacion/xlsx";
import type { CarteraVista } from "@/app/actions/cartera-actions";
import type { ProveedorCuentas } from "@/lib/proveedores/cuentas-por-pagar";
import type { RangoAntiguedad } from "@/lib/cartera/antiguedad";

/**
 * Arma las hojas de los reportes exportables (Fase 24, D10). Es lógica **pura**:
 * recibe datos ya consultados y devuelve filas. La escritura del archivo la hace
 * `escribirLibro` (el único punto del proyecto que habla con las librerías de
 * Excel), así que aquí no hay nada de I/O y se puede probar sin generar archivos.
 *
 * Todas las celdas se escriben con su tipo de JavaScript: un texto que empiece por
 * `=` queda como texto (nunca como fórmula), que es justo lo que se quiere cuando
 * el valor viene de un campo libre.
 */

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeZone: "America/Bogota",
});

const formatoHora = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

type Fila = (string | number | boolean | null)[];

const ETIQUETA_RANGO: Record<RangoAntiguedad, string> = {
  "0-30": "0 a 30 días",
  "31-60": "31 a 60 días",
  "61-90": "61 a 90 días",
  "90+": "Más de 90 días",
};

/** Cartera de clientes: una fila por factura con saldo, más el total. */
export function hojaCartera(vista: CarteraVista): HojaEscrita {
  const filas: Fila[] = [["Cliente", "Factura", "Emitida", "Días", "Antigüedad", "Total", "Saldo"]];

  for (const cliente of vista.clientes) {
    for (const factura of cliente.facturas) {
      filas.push([
        cliente.clienteNombre,
        factura.numero,
        formatoFecha.format(factura.emitidaAt),
        factura.dias,
        ETIQUETA_RANGO[factura.rango],
        factura.total,
        factura.saldo,
      ]);
    }
  }

  filas.push([]);
  filas.push(["Total por cobrar", null, null, null, null, null, vista.totales.total]);
  for (const rango of Object.keys(ETIQUETA_RANGO) as RangoAntiguedad[]) {
    if (vista.totales[rango] > 0) filas.push([`  ${ETIQUETA_RANGO[rango]}`, null, null, null, null, null, vista.totales[rango]]);
  }

  return { nombre: "Cartera", filas, anchos: [30, 10, 12, 8, 16, 14, 14] };
}

/** Cuentas por pagar: una fila por cuenta, con el nombre del proveedor. */
export function hojaCuentasPorPagar(
  proveedores: ProveedorCuentas[],
  totales: Record<RangoAntiguedad, number> & { total: number },
): HojaEscrita {
  const filas: Fila[] = [["Proveedor", "Fecha", "Días", "Antigüedad", "Total", "Saldo"]];

  for (const proveedor of proveedores) {
    for (const cuenta of proveedor.cuentas) {
      filas.push([
        proveedor.proveedorNombre,
        formatoFecha.format(cuenta.fecha),
        cuenta.dias,
        ETIQUETA_RANGO[cuenta.rango],
        cuenta.total,
        cuenta.saldo,
      ]);
    }
  }

  filas.push([]);
  filas.push(["Total por pagar", null, null, null, null, totales.total]);
  for (const rango of Object.keys(ETIQUETA_RANGO) as RangoAntiguedad[]) {
    if (totales[rango] > 0) filas.push([`  ${ETIQUETA_RANGO[rango]}`, null, null, null, null, totales[rango]]);
  }

  return { nombre: "Cuentas por pagar", filas, anchos: [30, 12, 8, 16, 14, 14] };
}

/** Ventas de mostrador del día. */
export function hojaVentasDelDia(
  ventas: {
    numero: number;
    createdAt: Date;
    clienteNombre: string | null;
    total: number;
    saldoPendiente: number;
    estado: string;
    items: { cantidad: number; descripcion: string }[];
  }[],
): HojaEscrita {
  const filas: Fila[] = [["Venta", "Hora", "Cliente", "Productos", "Total", "Saldo", "Estado"]];
  let total = 0;
  let saldo = 0;

  for (const venta of ventas) {
    const productos = venta.items.map((item) => `${item.cantidad} × ${item.descripcion}`).join("; ");
    filas.push([
      venta.numero,
      formatoHora.format(venta.createdAt),
      venta.clienteNombre ?? "Consumidor final",
      productos,
      venta.total,
      venta.saldoPendiente,
      venta.estado === "PAGADA" ? "Pagada" : "A crédito",
    ]);
    total += venta.total;
    saldo += venta.saldoPendiente;
  }

  filas.push([]);
  filas.push(["Total del día", null, null, null, Math.round(total * 100) / 100, Math.round(saldo * 100) / 100, null]);

  return { nombre: "Ventas de hoy", filas, anchos: [8, 8, 26, 46, 14, 14, 10] };
}

/** Arqueos de caja cerrados en el período. */
export function hojaArqueos(
  filasCaja: {
    abiertaAt: Date;
    cerradaAt: Date | null;
    abrioPorNombre: string;
    cerroPorNombre: string | null;
    baseInicial: number;
    esperado: number;
    contado: number | null;
    diferencia: number;
    tipo: "CUADRA" | "SOBRANTE" | "FALTANTE";
    notas: string | null;
  }[],
): HojaEscrita {
  const filas: Fila[] = [
    ["Apertura", "Cierre", "Abrió", "Cerró", "Base", "Esperado", "Contado", "Diferencia", "Resultado", "Notas"],
  ];

  for (const caja of filasCaja) {
    filas.push([
      `${formatoFecha.format(caja.abiertaAt)} ${formatoHora.format(caja.abiertaAt)}`,
      caja.cerradaAt ? `${formatoFecha.format(caja.cerradaAt)} ${formatoHora.format(caja.cerradaAt)}` : "Abierta",
      caja.abrioPorNombre,
      caja.cerroPorNombre ?? "",
      caja.baseInicial,
      caja.esperado,
      caja.contado,
      caja.diferencia,
      caja.tipo === "CUADRA" ? "Cuadra" : caja.tipo === "SOBRANTE" ? "Sobrante" : "Faltante",
      caja.notas ?? "",
    ]);
  }

  return { nombre: "Arqueos", filas, anchos: [22, 22, 18, 18, 14, 14, 14, 12, 12, 30] };
}
