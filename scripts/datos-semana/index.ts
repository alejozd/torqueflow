import { getTenantDb } from "@/lib/db/tenant-client";
import { cargarContexto, exigirSchemaPermitido, SCHEMA_PERMITIDO } from "./contexto";
import { ejecutarPlan, recortarAlPresente } from "./ejecutor";
import { hoyBogota } from "./fechas";
import { armarPlan, contarEventos } from "./plan";
import { confirmar, crearPregunton, hacerPreguntas } from "./preguntas";

/** Hora actual en Bogotá como "HH:MM". */
function horaBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(ahora);
}

function leerSemilla(argv: string[]): number {
  const i = argv.indexOf("--semilla");
  if (i === -1) return 1 + Math.floor(Math.random() * 999_999);
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error("--semilla requiere un entero positivo");
  return n;
}

export async function main(argv: string[]): Promise<void> {
  const semilla = leerSemilla(argv);
  exigirSchemaPermitido(SCHEMA_PERMITIDO);
  const db = getTenantDb(SCHEMA_PERMITIDO);
  const preguntas = crearPregunton();
  try {
    const ctx = await cargarContexto(db, SCHEMA_PERMITIDO);
    const hoy = hoyBogota();
    const respuestas = await hacerPreguntas(preguntas, ctx, hoy);
    const plan = recortarAlPresente(armarPlan(respuestas, semilla, hoy), hoy, horaBogota());
    const lineas = Object.entries(contarEventos(plan))
      .filter(([, n]) => n > 0)
      .map(([tipo, n]) => `  ${tipo}: ${n}`);
    const resumen = `Se crearán en ${SCHEMA_PERMITIDO} (semilla ${semilla}):\n${lineas.join("\n")}`;
    if (!(await confirmar(preguntas, resumen))) {
      console.log("Cancelado, no se creó nada.");
      return;
    }
    const estado = await ejecutarPlan(db, ctx, plan, semilla, console.log);
    console.log("Listo. Registros creados:");
    for (const [tipo, n] of Object.entries(estado.creados)) console.log(`  ${tipo}: ${n}`);
    console.log(`Semilla: ${semilla}`);
  } finally {
    preguntas.cerrar();
  }
}
