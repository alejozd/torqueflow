import {
  getReporteProductividad,
  getReporteRentabilidad,
  type ReporteFiltros,
} from "@/app/actions/reporte-actions";
import { listSedes } from "@/app/actions/sede-actions";
import { rangoMesActual } from "@/lib/reportes/rango-fechas";

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sedeId?: string }>;
}) {
  const { desde, hasta, sedeId } = await searchParams;
  const porDefecto = rangoMesActual(new Date());
  const filtros: ReporteFiltros = {
    desde: desde || porDefecto.desde,
    hasta: hasta || porDefecto.hasta,
    sedeId: sedeId || undefined,
  };

  // Sequential, never Promise.all: all three go through requireRole, which
  // redirect()s by throwing (Fase 5 Task 9's deliberate choice).
  const rentabilidad = await getReporteRentabilidad(filtros);
  const productividad = await getReporteProductividad(filtros);
  const sedes = await listSedes();

  return (
    <main>
      <h1>Reportes</h1>

      <form method="get" action="/reportes">
        <label htmlFor="desde">Desde</label>
        <input id="desde" name="desde" type="date" defaultValue={filtros.desde} required />

        <label htmlFor="hasta">Hasta</label>
        <input id="hasta" name="hasta" type="date" defaultValue={filtros.hasta} required />

        {/*
          Fase 6: a real selector replaces Fase 5's hidden input. It defaults to
          whatever the actions resolved (the sede activa when the URL carries
          none), so an ADMIN can compare any sede without re-logging-in --
          reading another sede's numbers is safe in a way that operating in it
          is not.
        */}
        <label htmlFor="sedeId">Sede</label>
        <select id="sedeId" name="sedeId" defaultValue={rentabilidad.filtros.sedeId}>
          {sedes.map((sede) => (
            <option key={sede.id} value={sede.id}>
              {sede.nombre}
            </option>
          ))}
        </select>

        <button type="submit">Aplicar</button>
      </form>

      {rentabilidad.error ? <p role="alert">{rentabilidad.error}</p> : null}

      <h2>Rentabilidad</h2>
      <p>
        Rango: {rentabilidad.filtros.desde} a {rentabilidad.filtros.hasta}
      </p>
      <p>Facturas emitidas: {rentabilidad.totales.facturasCount}</p>
      <p>Total facturado: {rentabilidad.totales.totalFacturado}</p>
      <p>Costo de repuestos: {rentabilidad.totales.costoRepuestos}</p>
      <p>Margen bruto: {rentabilidad.totales.margen}</p>
      <p>Margen bruto (%): {rentabilidad.totales.margenPorcentaje}</p>
      <p>Mano de obra facturada: {rentabilidad.totales.manoDeObraFacturada}</p>

      <h2>Productividad por técnico</h2>
      {productividad.filas.length === 0 ? (
        <p>No hay órdenes entregadas en este rango.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Técnico</th>
              <th scope="col">Órdenes entregadas</th>
              <th scope="col">Horas</th>
              <th scope="col">Mano de obra</th>
            </tr>
          </thead>
          <tbody>
            {productividad.filas.map((fila) => (
              <tr key={fila.mecanicoId ?? "sin-asignar"}>
                <td>{fila.mecanicoNombre}</td>
                <td>{fila.ordenesCompletadas}</td>
                <td>{fila.horasManoDeObra}</td>
                <td>{fila.montoManoDeObra}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
