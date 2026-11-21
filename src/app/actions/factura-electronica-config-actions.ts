"use server";

import { revalidatePath } from "next/cache";
import { requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { cifrarSecreto } from "@/lib/crypto/secret-box";
import {
  ErrorConfiguracionFe,
  crearProveedorDesdeConfig,
  diaIso,
  leerConfiguracionFe,
  type ConfiguracionFe,
} from "@/lib/factura-electronica/configuracion";
import { configuracionFeInputSchema, type ConfiguracionFeInput } from "@/lib/validation/factura-electronica";
import type {
  AmbienteFacturaElectronica,
  CuentaFacturaElectronica,
  EnvioFacturaElectronica,
  ResultadoSimuladoFacturaElectronica,
} from "@/generated/prisma-tenant";

const RUTA = "/configuracion-factura-electronica";
const ID = "singleton";

export interface ConfigFeFormState {
  error: string | null;
  success: boolean;
  mensaje: string | null;
}

/** Lo que ve la pantalla: nunca el token, solo si hay uno guardado. Fechas de resolución como "YYYY-MM-DD". */
export interface ConfiguracionFeVista {
  activa: boolean;
  envio: EnvioFacturaElectronica;
  ambiente: AmbienteFacturaElectronica;
  cuenta: CuentaFacturaElectronica;
  tokenConfigurado: boolean;
  nit: string | null;
  dv: string | null;
  razonSocial: string | null;
  regimen: string | null;
  responsabilidadFiscal: string | null;
  municipioCodigo: string | null;
  direccion: string | null;
  resolucionNumero: string | null;
  prefijo: string | null;
  rangoDesde: number | null;
  rangoHasta: number | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  siguienteConsecutivo: number;
  prefijoNotaCredito: string | null;
  resultadoSimulado: ResultadoSimuladoFacturaElectronica;
  ultimaPruebaAt: Date | null;
  ultimaPruebaExitosa: boolean | null;
  ultimaPruebaMensaje: string | null;
  ambienteProveedor: AmbienteFacturaElectronica | null;
}

const VISTA_VACIA: ConfiguracionFeVista = {
  activa: false,
  envio: "AUTOMATICO",
  ambiente: "SIMULADO",
  cuenta: "BOLSA",
  tokenConfigurado: false,
  nit: null,
  dv: null,
  razonSocial: null,
  regimen: null,
  responsabilidadFiscal: null,
  municipioCodigo: null,
  direccion: null,
  resolucionNumero: null,
  prefijo: null,
  rangoDesde: null,
  rangoHasta: null,
  vigenciaDesde: null,
  vigenciaHasta: null,
  siguienteConsecutivo: 1,
  prefijoNotaCredito: null,
  resultadoSimulado: "ACEPTAR",
  ultimaPruebaAt: null,
  ultimaPruebaExitosa: null,
  ultimaPruebaMensaje: null,
  ambienteProveedor: null,
};

const NOMBRE_AMBIENTE: Record<AmbienteFacturaElectronica, string> = {
  SIMULADO: "simulado",
  PRUEBAS: "pruebas",
  PRODUCCION: "producción",
};

function aVista(c: ConfiguracionFe): ConfiguracionFeVista {
  return {
    activa: c.activa,
    envio: c.envio,
    ambiente: c.ambiente,
    cuenta: c.cuenta,
    tokenConfigurado: Boolean(c.tokenCifrado),
    nit: c.nit,
    dv: c.dv,
    razonSocial: c.razonSocial,
    regimen: c.regimen,
    responsabilidadFiscal: c.responsabilidadFiscal,
    municipioCodigo: c.municipioCodigo,
    direccion: c.direccion,
    resolucionNumero: c.resolucionNumero,
    prefijo: c.prefijo,
    rangoDesde: c.rangoDesde,
    rangoHasta: c.rangoHasta,
    vigenciaDesde: c.vigenciaDesde ? diaIso(c.vigenciaDesde) : null,
    vigenciaHasta: c.vigenciaHasta ? diaIso(c.vigenciaHasta) : null,
    siguienteConsecutivo: c.siguienteConsecutivo,
    prefijoNotaCredito: c.prefijoNotaCredito,
    resultadoSimulado: c.resultadoSimulado,
    ultimaPruebaAt: c.ultimaPruebaAt,
    ultimaPruebaExitosa: c.ultimaPruebaExitosa,
    ultimaPruebaMensaje: c.ultimaPruebaMensaje,
    ambienteProveedor: c.ambienteProveedor,
  };
}

export async function getConfiguracionFe(): Promise<ConfiguracionFeVista> {
  const session = await requirePermiso("facturaElectronica.configurar");
  const fila = await leerConfiguracionFe(getTenantDb(session.user.tenantSchema));
  return fila ? aVista(fila) : VISTA_VACIA;
}

const aDia = (dia: string | null) => (dia === null ? null : new Date(`${dia}T00:00:00.000Z`));

/** Qué falta para enviar de verdad (fuera de Simulado). */
function faltantesParaActivar(d: ConfiguracionFeInput, tokenCifrado: string | null): string[] {
  const faltan: string[] = [];
  if (!d.nit || !d.dv) faltan.push("NIT y DV");
  if (!d.razonSocial) faltan.push("razón social");
  if (!d.regimen || !d.responsabilidadFiscal) faltan.push("régimen y responsabilidad fiscal");
  if (!d.municipioCodigo || !d.direccion) faltan.push("municipio y dirección");
  if (!d.resolucionNumero || !d.prefijo || d.rangoDesde === null || d.rangoHasta === null || !d.vigenciaDesde || !d.vigenciaHasta) {
    faltan.push("datos de la resolución");
  }
  if (!tokenCifrado) {
    faltan.push(
      d.cuenta === "BOLSA" ? "token del proveedor (con la bolsa de TorqueFlow lo registra TorqueFlow)" : "token del proveedor",
    );
  }
  return faltan;
}

async function consecutivoInicial(
  db: ReturnType<typeof getTenantDb>,
  d: { tipo: "FACTURA" | "NOTA_CREDITO"; ambiente: AmbienteFacturaElectronica; prefijo: string | null; desde: number },
): Promise<number> {
  if (d.prefijo === null) return d.desde;
  const { _max } = await db.documentoElectronico.aggregate({
    _max: { numero: true },
    where: { tipo: d.tipo, ambiente: d.ambiente, prefijo: d.prefijo },
  });
  return Math.max(d.desde, (_max.numero ?? 0) + 1);
}

export async function guardarConfiguracionFeAction(_prev: ConfigFeFormState, formData: FormData): Promise<ConfigFeFormState> {
  const session = await requirePermiso("facturaElectronica.configurar");
  const campo = (nombre: string) => String(formData.get(nombre) ?? "");
  const parsed = configuracionFeInputSchema.safeParse({
    activa: campo("activa"),
    envio: campo("envio"),
    ambiente: campo("ambiente"),
    cuenta: campo("cuenta"),
    token: campo("token"),
    nit: campo("nit"),
    dv: campo("dv"),
    razonSocial: campo("razonSocial"),
    regimen: campo("regimen"),
    responsabilidadFiscal: campo("responsabilidadFiscal"),
    municipioCodigo: campo("municipioCodigo"),
    direccion: campo("direccion"),
    resolucionNumero: campo("resolucionNumero"),
    prefijo: campo("prefijo"),
    rangoDesde: campo("rangoDesde"),
    rangoHasta: campo("rangoHasta"),
    vigenciaDesde: campo("vigenciaDesde"),
    vigenciaHasta: campo("vigenciaHasta"),
    prefijoNotaCredito: campo("prefijoNotaCredito"),
    resultadoSimulado: campo("resultadoSimulado") || "ACEPTAR",
    confirmarProduccion: campo("confirmarProduccion"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false, mensaje: null };
  }
  const d = parsed.data;
  const db = getTenantDb(session.user.tenantSchema);
  const existente = await leerConfiguracionFe(db);

  if (d.ambiente === "PRODUCCION" && existente?.ambiente !== "PRODUCCION" && d.confirmarProduccion !== "si") {
    return {
      error: "Confirma el paso a producción: desde ahí las facturas tienen validez ante la DIAN.",
      success: false,
      mensaje: null,
    };
  }

  // Con la bolsa, el token lo registra TorqueFlow (super-admin, Plan 2c): el taller no lo cambia.
  const tokenCifrado = d.cuenta === "PROPIA" && d.token ? cifrarSecreto(d.token) : (existente?.tokenCifrado ?? null);

  if (d.activa && d.ambiente !== "SIMULADO") {
    const faltan = faltantesParaActivar(d, tokenCifrado);
    if (faltan.length > 0) {
      return { error: `Para activar fuera de Simulado faltan: ${faltan.join(", ")}.`, success: false, mensaje: null };
    }
  }

  const resolucionNueva =
    !existente ||
    existente.resolucionNumero !== d.resolucionNumero ||
    existente.prefijo !== d.prefijo ||
    existente.rangoDesde !== d.rangoDesde;

  const pasaAProduccion = d.ambiente === "PRODUCCION" && existente?.ambiente !== "PRODUCCION";

  try {
    const primeraVezEnProduccion =
      pasaAProduccion && (await db.documentoElectronico.count({ where: { ambiente: "PRODUCCION" } })) === 0;

    const campos = {
      activa: d.activa,
      envio: d.envio,
      ambiente: d.ambiente,
      cuenta: d.cuenta,
      tokenCifrado,
      nit: d.nit,
      dv: d.dv,
      razonSocial: d.razonSocial,
      regimen: d.regimen,
      responsabilidadFiscal: d.responsabilidadFiscal,
      municipioCodigo: d.municipioCodigo,
      direccion: d.direccion,
      resolucionNumero: d.resolucionNumero,
      prefijo: d.prefijo,
      rangoDesde: d.rangoDesde,
      rangoHasta: d.rangoHasta,
      vigenciaDesde: aDia(d.vigenciaDesde),
      vigenciaHasta: aDia(d.vigenciaHasta),
      prefijoNotaCredito: d.prefijoNotaCredito,
      resultadoSimulado: d.resultadoSimulado,
      // Resolución nueva o paso a producción → se arranca en el inicio del rango (spec §11.10), pero nunca en un
      // número ya usado con ese prefijo en este ambiente (chocaría con el único tipo+ambiente+prefijo+numero).
      ...(resolucionNueva || pasaAProduccion
        ? {
            siguienteConsecutivo: await consecutivoInicial(db, {
              tipo: "FACTURA",
              ambiente: d.ambiente,
              prefijo: d.prefijo,
              desde: d.rangoDesde ?? 1,
            }),
          }
        : {}),
      ...(pasaAProduccion
        ? {
            siguienteConsecutivoNotaCredito: await consecutivoInicial(db, {
              tipo: "NOTA_CREDITO",
              ambiente: d.ambiente,
              prefijo: d.prefijoNotaCredito,
              desde: 1,
            }),
          }
        : {}),
      // Primera activación, o primera vez en producción: lo anterior no cuenta como pendiente (spec §11.11, §12).
      ...(d.activa && (!existente?.activadaDesde || primeraVezEnProduccion) ? { activadaDesde: new Date() } : {}),
    };

    await db.configuracionFacturaElectronica.upsert({ where: { id: ID }, create: { id: ID, ...campos }, update: campos });
  } catch (err) {
    return {
      error: friendlyPrismaErrorMessage(err, "Error al guardar la configuración de facturación electrónica"),
      success: false,
      mensaje: null,
    };
  }
  revalidatePath(RUTA);
  return { error: null, success: true, mensaje: "Configuración guardada." };
}

export async function probarConexionFeAction(_prev: ConfigFeFormState, _formData: FormData): Promise<ConfigFeFormState> {
  const session = await requirePermiso("facturaElectronica.configurar");
  const db = getTenantDb(session.user.tenantSchema);
  const config = await leerConfiguracionFe(db);
  if (!config) return { error: "Guarda la configuración antes de probar la conexión.", success: false, mensaje: null };

  const guardar = (exitosa: boolean, mensaje: string, ambienteProveedor: AmbienteFacturaElectronica | null) =>
    db.configuracionFacturaElectronica.update({
      where: { id: ID },
      data: { ultimaPruebaAt: new Date(), ultimaPruebaExitosa: exitosa, ultimaPruebaMensaje: mensaje, ambienteProveedor },
    });

  let resultado: Awaited<ReturnType<ReturnType<typeof crearProveedorDesdeConfig>["probarConexion"]>>;
  try {
    resultado = await crearProveedorDesdeConfig(config, session.user.tenantSchema).probarConexion();
  } catch (e) {
    const mensaje =
      e instanceof ErrorConfiguracionFe ? e.message : "No se pudo probar la conexión con el proveedor. Intenta de nuevo.";
    await guardar(false, mensaje, null);
    revalidatePath(RUTA);
    return { error: mensaje, success: false, mensaje: null };
  }

  if (!resultado.ok) {
    await guardar(false, resultado.mensaje, null);
    revalidatePath(RUTA);
    return { error: resultado.mensaje, success: false, mensaje: null };
  }

  const ambiente = resultado.ambiente;
  if (config.ambiente !== "SIMULADO" && ambiente !== config.ambiente) {
    const mensaje = ambiente
      ? `Hay conexión, pero el proveedor está en ${NOMBRE_AMBIENTE[ambiente]} y el taller en ${NOMBRE_AMBIENTE[config.ambiente]}. No se enviará nada hasta que coincidan.`
      : "Hay conexión, pero el proveedor no informó su ambiente. No se enviará nada hasta confirmarlo.";
    await guardar(false, mensaje, ambiente);
    revalidatePath(RUTA);
    return { error: mensaje, success: false, mensaje: null };
  }

  const mensaje = ambiente ? `Conexión correcta. El proveedor está en ${NOMBRE_AMBIENTE[ambiente]}.` : "Conexión correcta.";
  await guardar(true, mensaje, ambiente);
  revalidatePath(RUTA);
  return { error: null, success: true, mensaje };
}
