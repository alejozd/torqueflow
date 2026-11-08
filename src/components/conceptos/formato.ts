const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatoPesos(valor: number): string {
  return formatoMoneda.format(valor);
}

const formatoCantidad = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export function formatoUnidades(valor: number): string {
  return formatoCantidad.format(valor);
}
