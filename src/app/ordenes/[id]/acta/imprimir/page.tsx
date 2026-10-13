import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrden } from "@/app/actions/orden-actions";
import { DiagramaDanios } from "@/app/(dashboard)/ordenes/[id]/diagrama-danios";
import { formatoFechaCorta } from "@/lib/fecha-bogota";
import { ETIQUETA_DANIO, etiquetaZona } from "@/lib/danos/figuras";
import { coberturaDe } from "@/lib/garantias/cobertura";
import { ImprimirButton } from "./imprimir-button";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const NIVELES: Record<string, string> = {
  VACIO: "Vacío",
  CUARTO: "1/4",
  MEDIO: "1/2",
  TRES_CUARTOS: "3/4",
  LLENO: "Lleno",
};

/**
 * Acta de entrega imprimible (D11): se imprime con el navegador, sin librería de
 * PDF, como la cotización. Vive fuera del grupo (dashboard) para que salga sin el
 * menú lateral; el acceso lo sigue exigiendo `getOrden` (sesión + sede).
 */
export default async function ImprimirActaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orden = await getOrden(id);

  if (!orden) {
    notFound();
  }

  const acta = orden.acta;
  const firma = acta?.firmaUrl ?? acta?.firmaFotoUrl ?? null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8 text-black">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/ordenes/${orden.id}`} className="text-sm text-blue-700 underline">
          ← Volver a la orden
        </Link>
        <ImprimirButton />
      </div>

      <header className="flex flex-col gap-1 border-b border-black/20 pb-4">
        <h1 className="text-lg font-semibold">{orden.sede.nombre}</h1>
        <p className="text-sm text-black/70">
          Acta de entrega · Orden del {formatoFechaCorta.format(orden.createdAt)}
          {orden.entregadaAt ? ` · entregada el ${formatoFechaCorta.format(orden.entregadaAt)}` : ""}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-6 text-sm">
        <div>
          <h2 className="mb-1 font-semibold">Cliente</h2>
          <p>{orden.cliente.nombre}</p>
          <p className="text-black/70">{orden.cliente.telefono ?? "—"}</p>
          <p className="text-black/70">{orden.cliente.documento ?? ""}</p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold">Vehículo</h2>
          <p>{orden.vehiculo.placa}</p>
          <p className="text-black/70">
            {orden.vehiculo.marca} {orden.vehiculo.modelo}
            {orden.vehiculo.anio ? ` ${orden.vehiculo.anio}` : ""}
          </p>
          {orden.vehiculo.vin ? <p className="text-black/70">VIN {orden.vehiculo.vin}</p> : null}
        </div>
      </section>

      <section className="text-sm">
        <h2 className="mb-1 font-semibold">Estado con que ingresó</h2>
        <div className="grid grid-cols-3 gap-4">
          <p>
            <span className="text-black/70">Kilometraje: </span>
            {orden.kilometrajeIngreso ?? "—"}
          </p>
          <p>
            <span className="text-black/70">Combustible: </span>
            {orden.nivelCombustible ? NIVELES[orden.nivelCombustible] : "—"}
          </p>
          <p>
            <span className="text-black/70">Síntomas: </span>
            {orden.sintomas ?? "—"}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          Diagrama de daños{" "}
          <span className="font-normal text-black/60">
            ({orden.danios.length} {orden.danios.length === 1 ? "marca" : "marcas"})
          </span>
        </h2>
        <DiagramaDanios
          ordenId={orden.id}
          tipoVehiculo={orden.vehiculo.tipo}
          danios={orden.danios.map((danio) => ({ id: danio.id, zona: danio.zona, tipo: danio.tipo, nota: danio.nota }))}
          soloLectura
          puedeQuitar={false}
        />
        {orden.danios.length > 0 ? (
          <ul className="text-sm">
            {orden.danios.map((danio) => (
              <li key={danio.id}>
                {etiquetaZona(danio.zona)} · {ETIQUETA_DANIO[danio.tipo]}
                {danio.nota ? ` · ${danio.nota}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Trabajos y repuestos</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/40 text-left">
              <th className="py-1.5 pr-2">Concepto</th>
              <th className="py-1.5 pr-2 text-right">Cant.</th>
              <th className="py-1.5 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {orden.manoDeObra.map((linea) => (
              <tr key={linea.id} className="border-b border-black/10">
                <td className="py-1.5 pr-2">{linea.descripcion} (mano de obra)</td>
                <td className="py-1.5 pr-2 text-right">1</td>
                <td className="py-1.5 text-right">{formatoMoneda.format(Number(linea.valor))}</td>
              </tr>
            ))}
            {orden.items.map((item) => (
              <tr key={item.id} className="border-b border-black/10">
                <td className="py-1.5 pr-2">{item.descripcion}</td>
                <td className="py-1.5 pr-2 text-right">{item.cantidad}</td>
                <td className="py-1.5 text-right">
                  {formatoMoneda.format(Number(item.cantidad) * Number(item.precioUnitario))}
                </td>
              </tr>
            ))}
            {orden.manoDeObra.length === 0 && orden.items.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-3 text-center text-black/60">
                  La orden no tiene trabajos ni repuestos cargados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {orden.garantias.length > 0 ? (
        <section className="text-sm">
          <h2 className="mb-2 font-semibold">Garantías</h2>
          <ul className="flex flex-col gap-1">
            {orden.garantias.map((garantia) => (
              <li key={garantia.id}>
                {garantia.descripcion} ({garantia.tipo === "TRABAJO" ? "trabajo" : "repuesto"}) ·{" "}
                {coberturaDe({ cubreHasta: garantia.cubreHasta, cubreHastaKm: garantia.cubreHastaKm })}
                {garantia.nota ? ` · ${garantia.nota}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2 border-t border-black/20 pt-4 text-sm">
        <h2 className="font-semibold">Entrega</h2>
        {acta ? (
          <>
            <p>
              <span className="text-black/70">Recibe: </span>
              {acta.recibidoPor}
              {acta.documentoRecibe ? ` · ${acta.documentoRecibe}` : ""}
            </p>
            {acta.observaciones ? <p className="text-black/80">{acta.observaciones}</p> : null}
            {firma ? (
              // eslint-disable-next-line @next/next/no-img-element -- archivo servido por la propia app.
              <img src={firma} alt={`Firma de ${acta.recibidoPor}`} className="mt-2 max-w-72 border-b border-black/40" />
            ) : null}
            <p className="text-black/60">
              {acta.firmadaAt
                ? `Firmada el ${formatoFechaCorta.format(acta.firmadaAt)} por ${acta.recibidoPor}.`
                : "Acta pendiente de firma."}
            </p>
          </>
        ) : (
          <p className="text-black/60">Esta orden todavía no tiene acta de entrega.</p>
        )}
      </section>
    </main>
  );
}
