import { cargarPlantillasParaPendientes } from "@/lib/gastos/pendientes-db";
import { periodoActualBogota } from "@/lib/gastos/periodo";
import { calcularRecurrentesPendientes } from "@/lib/gastos/recurrentes-pendientes";
import { MARCA, type Contexto } from "./contexto";
import type { EstadoEjecucion, Manejador, TenantTx } from "./ejecutor";
import { instante, soloDia } from "./fechas";

const sumar = (estado: EstadoEjecucion, clave: string, n = 1) => {
  estado.creados[clave] = (estado.creados[clave] ?? 0) + n;
};

const conMarca = (texto: string) => (texto.startsWith(MARCA) ? texto : `${MARCA} ${texto}`);
const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Gastos corrientes del día a día; el monto va en miles de pesos (mínimo, máximo). */
const GASTOS = [
  { categoria: "Papelería", descripciones: ["Resma de papel y tóner", "Esferos y cuadernos del taller", "Papel para facturas"], miles: [8, 60] },
  { categoria: "Aseo", descripciones: ["Jabón, traperos y desengrasante", "Bolsas de basura y guantes", "Trapos y limpiavidrios"], miles: [10, 80] },
  { categoria: "Alimentación", descripciones: ["Almuerzos del personal", "Tinto y refrigerios", "Agua y bebidas del taller"], miles: [15, 120] },
] as const;

/** Plantillas que se crean si la sede no tiene ninguna: día del mes y monto estimado en miles de pesos. */
const PLANTILLAS = [
  { categoria: "Arriendo", descripcion: "Arriendo del local", dia: 5, miles: [900, 2_400] },
  { categoria: "Servicios públicos", descripcion: "Servicios públicos (agua, luz e internet)", dia: 10, miles: [180, 450] },
] as const;

/** Categoría por nombre (sin distinguir tildes ni mayúsculas); si no existe se crea y se agrega al contexto. */
async function categoriaPorNombre(tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, nombre: string): Promise<string> {
  const buscada = sinTildes(nombre);
  const existente = ctx.categoriasGasto.find((c) => sinTildes(c.nombre) === buscada);
  if (existente) return existente.id;
  const creada = await tx.categoriaGasto.create({ data: { nombre, orden: ctx.categoriasGasto.length + 1 } });
  ctx.categoriasGasto.push({ id: creada.id, nombre });
  sumar(estado, "categoriaGasto");
  return creada.id;
}

/**
 * crearGastoAction: un gasto corriente de la sede. En efectivo solo con caja abierta (sale del
 * cajón); sin caja, o si no era en efectivo, se paga por transferencia. `fecha` es @db.Date y
 * `createdAt` el instante: el arqueo cuenta el gasto por este último.
 */
export const registrarGasto: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "gasto") return;
  const creado = instante(dia.fecha, evento.hora);
  const tipo = az.elegir(GASTOS);
  const categoriaId = await categoriaPorNombre(tx, ctx, estado, tipo.categoria);
  const pagadoEnEfectivo = evento.efectivo && estado.cajaAbierta.has(dia.sedeId);
  await tx.gasto.create({
    data: {
      sedeId: dia.sedeId,
      categoriaId,
      descripcion: conMarca(az.elegir(tipo.descripciones)),
      monto: az.entero(tipo.miles[0], tipo.miles[1]) * 1000,
      fecha: soloDia(dia.fecha),
      referencia: pagadoEnEfectivo ? null : `${MARCA} Transferencia ${az.entero(100_000, 999_999)}`,
      registradoPorId: ctx.recepcionistaId,
      pagadoEnEfectivo,
      createdAt: creado,
      updatedAt: creado,
    },
  });
  sumar(estado, "gasto");
};

/**
 * crearGastoRecurrenteAction (si la sede no tiene plantillas del script: arriendo y servicios) +
 * calcularRecurrentesPendientes + confirmarRecurrenteAction. Solo se confirma el mes del día del
 * evento: los meses anteriores olvidados no se tocan para no dejar gastos fuera de la semana.
 */
export const registrarGastosRecurrentes: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "gastosRecurrentes") return;
  const creado = instante(dia.fecha, evento.hora);
  const periodo = periodoActualBogota(creado);

  // Solo las plantillas creadas por el script: confirmar una real cambiaría su estado (p. ej. el arriendo real dejaría de estar pendiente).
  const propias = async () =>
    (await cargarPlantillasParaPendientes(tx, dia.sedeId)).filter((p) => p.descripcion.startsWith(MARCA));
  let plantillas = await propias();
  if (plantillas.length === 0) {
    for (const p of PLANTILLAS) {
      await tx.gastoRecurrente.create({
        data: {
          sedeId: dia.sedeId,
          categoriaId: await categoriaPorNombre(tx, ctx, estado, p.categoria),
          descripcion: conMarca(p.descripcion),
          montoEstimado: az.entero(p.miles[0] / 10, p.miles[1] / 10) * 10_000,
          diaDelMes: p.dia,
          desde: periodo,
        },
      });
      sumar(estado, "gastoRecurrente");
    }
    plantillas = await propias();
  }

  const categorias = new Map(
    (await tx.gastoRecurrente.findMany({ where: { sedeId: dia.sedeId }, select: { id: true, categoriaId: true } }))
      .map((p) => [p.id, p.categoriaId]),
  );
  for (const pendiente of calcularRecurrentesPendientes(plantillas, periodo).filter((p) => p.periodo === periodo)) {
    await tx.gasto.create({
      data: {
        sedeId: dia.sedeId,
        categoriaId: categorias.get(pendiente.recurrenteId)!,
        descripcion: conMarca(pendiente.descripcion),
        monto: pendiente.montoEstimado,
        fecha: soloDia(dia.fecha),
        referencia: null,
        gastoRecurrenteId: pendiente.recurrenteId,
        periodo,
        registradoPorId: ctx.actorId,
        createdAt: creado,
        updatedAt: creado,
      },
    });
    sumar(estado, "gasto");
  }
};
