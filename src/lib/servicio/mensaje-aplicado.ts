/**
 * Texto del toast tras aplicar un servicio del catálogo, compartido por el
 * formulario de la orden y el de la cotización (misma acción, distinto destino).
 * Solo describe lo que la action dice haber creado: si el kit no trae mano de
 * obra propia, no la menciona.
 */
export function mensajeServicioAplicado(agregados: { manoDeObra: boolean; repuestos: number }): string {
  const partes: string[] = [];
  if (agregados.manoDeObra) partes.push("mano de obra");
  if (agregados.repuestos === 1) partes.push("1 repuesto");
  else if (agregados.repuestos > 1) partes.push(`${agregados.repuestos} repuestos`);
  return partes.length > 0 ? `Servicio agregado: ${partes.join(" y ")}` : "Servicio agregado";
}
