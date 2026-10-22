import { celular, cedula, correo, nombrePersona, placa, type Azar } from "./azar";
import { MARCA, type Contexto } from "./contexto";
import type { EstadoEjecucion, Manejador, TenantTx } from "./ejecutor";
import { instante, soloDia, sumarDias } from "./fechas";

const COLORES = ["Blanco", "Negro", "Gris", "Rojo", "Plata", "Azul"] as const;
const COMBUSTIBLES = ["GASOLINA", "GASOLINA", "GASOLINA", "DIESEL", "HIBRIDO"] as const;
const RESPALDO: MarcaCatalogo[] = [
  { nombre: "Chevrolet", modelos: [{ nombre: "Spark" }, { nombre: "Sail" }] },
  { nombre: "Renault", modelos: [{ nombre: "Logan" }, { nombre: "Duster" }] },
];

interface MarcaCatalogo { id?: string; nombre: string; modelos: { id?: string; nombre: string }[] }

const sumar = (estado: EstadoEjecucion, clave: string) => {
  estado.creados[clave] = (estado.creados[clave] ?? 0) + 1;
};

async function cargarCatalogo(tx: TenantTx): Promise<MarcaCatalogo[]> {
  const marcas = await tx.marcaVehiculo.findMany({ include: { modelos: true } });
  const utiles = marcas.filter((m) => m.modelos.length > 0);
  return utiles.length > 0 ? utiles : RESPALDO;
}

/** createClienteAction + createVehiculoAction (1 o 2 vehículos). `cuando` fija createdAt. */
export async function crearClienteConVehiculos(
  tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, az: Azar, fecha: string, cuando?: Date,
): Promise<{ clienteId: string; vehiculoIds: string[] }> {
  const { nombres, apellidos } = nombrePersona(az);
  const tiempos = cuando ? { createdAt: cuando, updatedAt: cuando } : {};
  const cliente = await tx.cliente.create({
    data: {
      nombre: `${nombres} ${apellidos}`,
      telefono: celular(az),
      email: correo(nombres, apellidos, az),
      documento: cedula(az),
      ...tiempos,
    },
  });
  const catalogo = await cargarCatalogo(tx);
  const vehiculoIds: string[] = [];
  const cantidad = az.probabilidad(0.3) ? 2 : 1;
  for (let i = 0; i < cantidad; i++) {
    const marca = az.elegir(catalogo);
    const modelo = az.elegir(marca.modelos);
    const nueva = placa(az, ctx.placasOcupadas);
    ctx.placasOcupadas.add(nueva);
    const vence = az.probabilidad(0.25) ? soloDia(sumarDias(fecha, az.entero(5, 40))) : undefined;
    const esSoat = az.probabilidad(0.5);
    const vehiculo = await tx.vehiculo.create({
      data: {
        placa: nueva,
        marca: marca.nombre,
        modelo: modelo.nombre,
        marcaId: marca.id,
        modeloId: modelo.id,
        color: az.elegir(COLORES),
        anio: az.entero(2008, 2024),
        combustible: az.elegir(COMBUSTIBLES),
        kilometraje: az.entero(20, 180) * 1000,
        transmision: az.probabilidad(0.7) ? "MECANICA" : "AUTOMATICA",
        observaciones: MARCA,
        tipo: "CARRO",
        soatVence: esSoat ? vence : undefined,
        tecnomecanicaVence: esSoat ? undefined : vence,
        clienteId: cliente.id,
        ...tiempos,
      },
    });
    vehiculoIds.push(vehiculo.id);
    sumar(estado, "vehiculo");
  }
  sumar(estado, "cliente");
  estado.clientesCreados.push({ clienteId: cliente.id, vehiculoIds });
  return { clienteId: cliente.id, vehiculoIds };
}

export const crearCliente: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "crearCliente") return;
  await crearClienteConVehiculos(tx, ctx, estado, az, dia.fecha, instante(dia.fecha, evento.hora));
};

/**
 * Cliente y vehículo para una cita/orden/venta: primero los creados por el script que aún no se
 * usaron, luego los existentes con vehículo; si no hay ninguno, crea uno nuevo.
 */
export async function elegirClienteYVehiculo(
  tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, az: Azar, fecha: string, cuando?: Date,
): Promise<{ clienteId: string; vehiculoId: string }> {
  const sinUsar = estado.clientesCreados.find((c) => !estado.clientesUsados.has(c.clienteId));
  if (sinUsar) {
    estado.clientesUsados.add(sinUsar.clienteId);
    return { clienteId: sinUsar.clienteId, vehiculoId: az.elegir(sinUsar.vehiculoIds) };
  }
  const existentes = ctx.clientesExistentes.filter((c) => c.vehiculoIds.length > 0);
  if (existentes.length > 0) {
    const cliente = az.elegir(existentes);
    return { clienteId: cliente.id, vehiculoId: az.elegir(cliente.vehiculoIds) };
  }
  const nuevo = await crearClienteConVehiculos(tx, ctx, estado, az, fecha, cuando);
  estado.clientesUsados.add(nuevo.clienteId);
  return { clienteId: nuevo.clienteId, vehiculoId: az.elegir(nuevo.vehiculoIds) };
}
