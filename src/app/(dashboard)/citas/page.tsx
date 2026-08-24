import Link from "next/link";
import { listCitas, listVehiculosParaCita } from "@/app/actions/cita-actions";
import { NuevaCitaForm } from "./nueva-cita-form";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

export default async function CitasPage() {
  // Both reads go through the actions module, so the guard and the sede filter
  // are applied in exactly one place instead of being restated here.
  const [citas, vehiculos] = await Promise.all([listCitas(), listVehiculosParaCita()]);

  return (
    <main>
      <h1>Citas</h1>
      <NuevaCitaForm vehiculos={vehiculos} />

      {citas.length === 0 ? (
        <p>No hay citas agendadas en esta sede.</p>
      ) : (
        <ul>
          {citas.map((cita) => (
            <li key={cita.id}>
              <Link href={`/citas/${cita.id}`}>
                {`${formatoFecha.format(cita.fechaHora)} — ${cita.vehiculo.placa} — ${cita.motivo}`}
              </Link>
              <span>{` [${cita.estado}]`}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
