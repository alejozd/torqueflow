import { getReporteRentabilidad, type ReporteFiltros } from "@/app/actions/reporte-actions";
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

  const rentabilidad = await getReporteRentabilidad(filtros);

  return (
    <main>
      <h1>Reportes</h1>

      <form method="get" action="/reportes">
        <label htmlFor="desde">Desde</label>
        <input id="desde" name="desde" type="date" defaultValue={filtros.desde} required />

        <label htmlFor="hasta">Hasta</label>
        <input id="hasta" name="hasta" type="date" defaultValue={filtros.hasta} required />

        {/*
          Fase 5 has no sede selector on purpose (that is Fase 6). The hidden
          input keeps an explicit sedeId in the URL round-tripping through the
          form so the query-param plumbing is already complete end to end.
        */}
        {filtros.sedeId ? <input type="hidden" name="sedeId" value={filtros.sedeId} /> : null}

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
    </main>
  );
}
