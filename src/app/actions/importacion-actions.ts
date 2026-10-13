"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { getTenantDb } from "@/lib/db/tenant-client";
import {
  claveCodigo,
  claveDocumento,
  claveNombreCliente,
  claveNombreServicio,
  clavePlaca,
  separarDuplicados,
  setDeClaves,
} from "@/lib/importacion/duplicados";
import { HOJAS, MAX_BYTES_ARCHIVO, type HojaContrato } from "@/lib/importacion/hojas";
import { leerHoja } from "@/lib/importacion/lectura";
import {
  limitarFilas,
  resumenVacio,
  resultadoVacio,
  type FilaReporte,
  type ResultadoImportacion,
  type ResumenHoja,
} from "@/lib/importacion/resultado";
import {
  buscarCliente,
  indexarClientes,
  validarClientes,
  validarRepuestos,
  validarServicios,
  validarVehiculos,
  type ClienteImportado,
  type ClienteResuelto,
  type LecturaOk,
} from "@/lib/importacion/validacion";
import { leerLibro } from "@/lib/importacion/xlsx";
import { scopeBodega } from "@/lib/sede/scope";

const BODEGA_AJENA = "La bodega seleccionada no pertenece a tu sede activa.";
const HOJA_SERVICIOS = "Servicios";

type TenantDb = ReturnType<typeof getTenantDb>;

interface Contexto {
  tenantDb: TenantDb;
  usuarioId: string;
  sedeId: string;
  bodegaId: string | null;
  proveedorId: string | null;
  /** Clientes creados en esta corrida, para resolver los vehículos que vienen detrás. */
  clientesCreados: { id: string; nombre: string; documento: string | null }[];
}

interface ResultadoHoja {
  resumen: ResumenHoja;
  novedades: FilaReporte[];
}

const hojaOmitida = (nombre: string, motivo: string, leidas = 0): ResumenHoja => ({
  ...resumenVacio(nombre),
  leidas,
  estado: "omitida",
  motivo,
});

const hojaConError = (nombre: string, motivo: string, leidas: number): ResumenHoja => ({
  ...resumenVacio(nombre),
  leidas,
  estado: "error",
  motivo,
});

// ---------------------------------------------------------------- clientes

async function importarClientes(ctx: Contexto, lectura: LecturaOk): Promise<ResultadoHoja> {
  const { validas, rechazos } = validarClientes(lectura);
  // Una sola consulta por hoja: sirve para detectar duplicados y para resolver
  // después los vehículos que referencian a estos clientes.
  const existentesEnBase = await ctx.tenantDb.cliente.findMany({
    select: { id: true, nombre: true, documento: true },
  });

  const claves = setDeClaves(
    existentesEnBase.flatMap((cliente) => [claveDocumento(cliente.documento), claveNombreCliente(cliente.nombre)]),
  );
  const { nuevas, omitidas } = separarDuplicados(validas, claves, "Clientes", describirCliente);

  let creadas = 0;
  const novedades = [...lectura.rechazos, ...rechazos, ...omitidas];

  try {
    await ctx.tenantDb.$transaction(async (tx) => {
      for (const cliente of nuevas) {
        const creado = await tx.cliente.create({
          data: {
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            email: cliente.email,
            documento: cliente.documento,
          },
          select: { id: true, nombre: true, documento: true },
        });
        ctx.clientesCreados.push(creado);
        creadas += 1;
      }
    });
  } catch (err) {
    return { resumen: hojaConError("Clientes", friendlyPrismaErrorMessage(err, "No se pudieron crear los clientes"), lectura.filas.length), novedades };
  }

  return {
    resumen: { hoja: "Clientes", leidas: lectura.filas.length, creadas, existentes: omitidas.length, rechazadas: lectura.rechazos.length + rechazos.length, estado: "ok", motivo: null },
    novedades,
  };
}

const describirCliente = (fila: ClienteImportado, clave: string) =>
  clave.startsWith("doc:") ? `documento ${fila.documento ?? ""}` : `nombre ${fila.nombre}`;

// ---------------------------------------------------------------- vehículos

async function importarVehiculos(ctx: Contexto, lectura: LecturaOk): Promise<ResultadoHoja> {
  const { validas, rechazos } = validarVehiculos(lectura);
  const existentesEnBase = await ctx.tenantDb.vehiculo.findMany({ select: { placa: true } });
  const claves = setDeClaves(existentesEnBase.map((vehiculo) => clavePlaca(vehiculo.placa)));
  const { nuevas, omitidas } = separarDuplicados(validas, claves, "Vehículos", describirVehiculo);

  // El índice de clientes mezcla los que ya existían con los que se acaban de
  // crear en esta misma importación (por eso Clientes va antes).
  const clientesEnBase = await ctx.tenantDb.cliente.findMany({
    select: { id: true, nombre: true, documento: true },
  });
  const indice = indexarClientes([...clientesEnBase, ...ctx.clientesCreados]);

  const sinCliente: FilaReporte[] = [];
  const aCrear: { fila: (typeof nuevas)[number]; cliente: ClienteResuelto }[] = [];
  for (const fila of nuevas) {
    const cliente = buscarCliente(indice, fila);
    if (!cliente) {
      sinCliente.push({
        hoja: "Vehículos",
        fila: fila.numeroFila,
        columna: "Documento cliente",
        valor: fila.documentoCliente ?? fila.nombreCliente,
        motivo: "No encontré ese cliente en el sistema ni en la hoja de Clientes de este archivo",
        tipo: "rechazada",
      });
      continue;
    }
    aCrear.push({ fila, cliente });
  }

  let creadas = 0;
  const novedades = [...lectura.rechazos, ...rechazos, ...omitidas, ...sinCliente];

  try {
    await ctx.tenantDb.$transaction(async (tx) => {
      for (const { fila, cliente } of aCrear) {
        await tx.vehiculo.create({
          data: {
            placa: fila.placa,
            marca: fila.marca,
            modelo: fila.modelo,
            tipo: fila.tipo as never,
            anio: fila.anio,
            kilometraje: fila.kilometraje,
            color: fila.color,
            vin: fila.vin,
            combustible: fila.combustible as never,
            transmision: fila.transmision as never,
            soatVence: fila.soatVence,
            tecnomecanicaVence: fila.tecnomecanicaVence,
            observaciones: fila.observaciones,
            clienteId: cliente.id,
          },
        });
        creadas += 1;
      }
    });
  } catch (err) {
    return {
      resumen: hojaConError("Vehículos", friendlyPrismaErrorMessage(err, "No se pudieron crear los vehículos"), lectura.filas.length),
      novedades,
    };
  }

  return {
    resumen: {
      hoja: "Vehículos",
      leidas: lectura.filas.length,
      creadas,
      existentes: omitidas.length,
      rechazadas: lectura.rechazos.length + rechazos.length + sinCliente.length,
      estado: "ok",
      motivo: null,
    },
    novedades,
  };
}

const describirVehiculo = (fila: { placa: string }, _clave: string) => `placa ${fila.placa}`;

// ---------------------------------------------------------------- repuestos

async function importarRepuestos(ctx: Contexto, lectura: LecturaOk): Promise<ResultadoHoja> {
  if (!ctx.bodegaId) {
    return { resumen: hojaOmitida("Repuestos", "Elige la bodega donde entran los repuestos"), novedades: [] };
  }

  const { validas, rechazos } = validarRepuestos(lectura, { bodegaId: ctx.bodegaId, proveedorId: ctx.proveedorId });
  const existentesEnBase = await ctx.tenantDb.repuesto.findMany({ select: { codigo: true } });
  const claves = setDeClaves(existentesEnBase.map((repuesto) => claveCodigo(repuesto.codigo)));
  const { nuevas, omitidas } = separarDuplicados(validas, claves, "Repuestos", describirRepuesto);

  let creadas = 0;
  const novedades = [...lectura.rechazos, ...rechazos, ...omitidas];

  try {
    await ctx.tenantDb.$transaction(async (tx) => {
      // La entrada de mercancía se crea una sola vez, para las filas que traen
      // cantidad inicial (D5), y es lo que deja el rastro del stock que entra.
      let entradaId: string | null = null;

      for (const repuesto of nuevas) {
        const creado = await tx.repuesto.create({
          data: {
            codigo: repuesto.codigo,
            nombre: repuesto.nombre,
            descripcion: repuesto.descripcion,
            precioCompra: repuesto.precioCompra,
            precioVenta: repuesto.precioVenta,
            stockMinimo: repuesto.stockMinimo,
            stockMaximo: repuesto.stockMaximo,
            multiploCompra: repuesto.multiploCompra,
            // El stock entra por la entrada, no de golpe al crear la fila.
            stockActual: 0,
            bodegaId: ctx.bodegaId!,
            proveedorId: ctx.proveedorId,
          },
          select: { id: true },
        });
        creadas += 1;

        if (repuesto.cantidadInicial > 0 && ctx.proveedorId) {
          if (!entradaId) {
            const entrada = await tx.entradaMercancia.create({
              data: { proveedorId: ctx.proveedorId, bodegaId: ctx.bodegaId!, creadoPorId: ctx.usuarioId },
              select: { id: true },
            });
            entradaId = entrada.id;
          }
          await tx.entradaMercanciaItem.create({
            data: {
              entradaId,
              repuestoId: creado.id,
              cantidad: repuesto.cantidadInicial,
              precioCompraUnitario: repuesto.precioCompra,
            },
          });
          await tx.repuesto.update({
            where: { id: creado.id },
            data: { stockActual: { increment: repuesto.cantidadInicial } },
          });
        }
      }
    });
  } catch (err) {
    return {
      resumen: hojaConError("Repuestos", friendlyPrismaErrorMessage(err, "No se pudieron crear los repuestos"), lectura.filas.length),
      novedades,
    };
  }

  return {
    resumen: {
      hoja: "Repuestos",
      leidas: lectura.filas.length,
      creadas,
      existentes: omitidas.length,
      rechazadas: lectura.rechazos.length + rechazos.length,
      estado: "ok",
      motivo: null,
    },
    novedades,
  };
}

const describirRepuesto = (fila: { codigo: string }, _clave: string) => `código ${fila.codigo}`;

// ---------------------------------------------------------------- servicios

async function importarServicios(ctx: Contexto, lectura: LecturaOk): Promise<ResultadoHoja> {
  const { validas, rechazos } = validarServicios(lectura);
  const existentesEnBase = await ctx.tenantDb.servicio.findMany({ select: { nombre: true } });
  const claves = setDeClaves(existentesEnBase.map((servicio) => claveNombreServicio(servicio.nombre)));
  const { nuevas, omitidas } = separarDuplicados(validas, claves, HOJA_SERVICIOS, describirServicio);

  let creadas = 0;
  const novedades = [...lectura.rechazos, ...rechazos, ...omitidas];

  try {
    await ctx.tenantDb.$transaction(async (tx) => {
      for (const servicio of nuevas) {
        await tx.servicio.create({
          data: {
            nombre: servicio.nombre,
            descripcion: servicio.descripcion,
            precioManoObra: servicio.precioManoObra,
            activo: servicio.activo,
          },
        });
        creadas += 1;
      }
    });
  } catch (err) {
    return {
      resumen: hojaConError(HOJA_SERVICIOS, friendlyPrismaErrorMessage(err, "No se pudieron crear los servicios"), lectura.filas.length),
      novedades,
    };
  }

  return {
    resumen: {
      hoja: HOJA_SERVICIOS,
      leidas: lectura.filas.length,
      creadas,
      existentes: omitidas.length,
      rechazadas: lectura.rechazos.length + rechazos.length,
      estado: "ok",
      motivo: null,
    },
    novedades,
  };
}

const describirServicio = (fila: { nombre: string }, _clave: string) => `servicio ${fila.nombre}`;

// ---------------------------------------------------------------- acción

/**
 * Importa un libro de Excel con clientes, vehículos, repuestos y servicios
 * (Fase 20). Solo crea: lo que ya existe se informa y no se toca (D2). Las filas
 * con errores se devuelven con su hoja, fila, columna y motivo, y las buenas de
 * esa misma hoja sí entran (D3).
 *
 * Cada hoja se escribe en su propia transacción (D11): si una falla, las
 * anteriores quedan y esa se reporta como error. El orden de HOJAS es el de las
 * dependencias (clientes antes que vehículos, repuestos antes de su stock).
 */
export async function importarAction(
  prevState: ResultadoImportacion,
  formData: FormData,
): Promise<ResultadoImportacion> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return resultadoVacio("Selecciona el archivo de Excel (.xlsx) que quieres importar");
  }
  if (!archivo.name.toLowerCase().endsWith(".xlsx")) {
    return resultadoVacio("El archivo debe ser un libro de Excel con extensión .xlsx");
  }
  if (archivo.size > MAX_BYTES_ARCHIVO) {
    return resultadoVacio(
      `El archivo pesa más de ${Math.round(MAX_BYTES_ARCHIVO / 1024 / 1024)} MB: divídelo en varios archivos`,
    );
  }

  let hojasLeidas: Awaited<ReturnType<typeof leerLibro>>;
  try {
    hojasLeidas = await leerLibro(archivo);
  } catch {
    return resultadoVacio("No pudimos leer el archivo: revisa que sea un .xlsx de Excel y que no esté protegido");
  }

  const presentes = HOJAS.map((contrato) => ({
    contrato,
    hoja: hojasLeidas.find((leida) => normalizar(leida.nombre) === normalizar(contrato.nombre)),
  })).filter((entrada): entrada is { contrato: HojaContrato; hoja: (typeof hojasLeidas)[number] } => entrada.hoja !== undefined);

  if (presentes.length === 0) {
    return resultadoVacio("No encontramos ninguna de las hojas esperadas: Clientes, Vehículos, Repuestos o Servicios");
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const bodegaIdPedida = String(formData.get("bodegaId") ?? "").trim();
  const proveedorIdPedido = String(formData.get("proveedorId") ?? "").trim() || null;

  // La bodega es obligatoria en cuanto venga la hoja de repuestos (el modelo la
  // exige) y tiene que ser de la sede activa.
  const hayRepuestos = presentes.some((entrada) => entrada.contrato.nombre === "Repuestos");
  let bodegaId: string | null = null;
  if (hayRepuestos) {
    if (!bodegaIdPedida) return resultadoVacio("Elige la bodega donde entran los repuestos");
    const bodega = await tenantDb.bodega.findFirst({
      where: { id: bodegaIdPedida, ...scopeBodega(session.user.sedeActivaId) },
      select: { id: true },
    });
    if (!bodega) return resultadoVacio(BODEGA_AJENA);
    bodegaId = bodega.id;
  }

  if (proveedorIdPedido) {
    const proveedor = await tenantDb.proveedor.findFirst({
      where: { id: proveedorIdPedido },
      select: { id: true },
    });
    if (!proveedor) return resultadoVacio("El proveedor seleccionado no existe");
  }

  const ctx: Contexto = {
    tenantDb,
    usuarioId: session.user.id,
    sedeId: session.user.sedeActivaId,
    bodegaId,
    proveedorId: proveedorIdPedido,
    clientesCreados: [],
  };

  const resumen: ResumenHoja[] = [];
  const novedades: FilaReporte[] = [];

  for (const { contrato, hoja } of presentes) {
    const lectura = leerHoja(contrato, hoja.filas);
    if (!lectura.ok) {
      resumen.push(hojaOmitida(contrato.nombre, lectura.motivo));
      continue;
    }

    if (contrato.nombre === HOJA_SERVICIOS && session.user.role !== "ADMIN") {
      resumen.push(
        hojaOmitida(HOJA_SERVICIOS, "Solo un administrador puede importar servicios", lectura.filas.length),
      );
      continue;
    }

    const resultado =
      contrato.nombre === "Clientes"
        ? await importarClientes(ctx, lectura)
        : contrato.nombre === "Vehículos"
          ? await importarVehiculos(ctx, lectura)
          : contrato.nombre === "Repuestos"
            ? await importarRepuestos(ctx, lectura)
            : await importarServicios(ctx, lectura);

    resumen.push(resultado.resumen);
    novedades.push(...resultado.novedades);
  }

  revalidatePath("/clientes");
  revalidatePath("/repuestos");
  revalidatePath("/servicios");
  revalidatePath("/vencimientos");
  revalidatePath("/importar");

  const { visibles, ocultas } = limitarFilas(novedades);
  return { error: null, resumen, filas: visibles, filasOcultas: ocultas };
}

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
