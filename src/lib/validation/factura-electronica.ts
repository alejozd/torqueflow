import { z } from "zod";
import { RESPONSABILIDADES_FISCALES, TIPOS_DOCUMENTO_IDENTIDAD, calcularDvNit } from "@/modulos/factura-electronica";

const tiene = (objeto: object, clave: string) => Object.prototype.hasOwnProperty.call(objeto, clave);

/** "" → null; si no, el texto recortado. */
const textoOpcional = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v));

const enteroOpcional = textoOpcional.refine((v) => v === null || /^\d{1,10}$/.test(v), "Debe ser un número entero.").transform(
  (v) => (v === null ? null : Number(v)),
);

const diaOpcional = textoOpcional.refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha inválida.");

const casilla = z.string().transform((v) => v === "on");

const responsabilidadOpcional = textoOpcional.refine(
  (v) => v === null || tiene(RESPONSABILIDADES_FISCALES, v),
  "Responsabilidad fiscal desconocida.",
);

const municipioOpcional = textoOpcional.refine((v) => v === null || /^\d{5}$/.test(v), "El municipio debe ser un código DANE de 5 dígitos.");

function dvCorresponde(nit: string | null, dv: string | null): boolean {
  if (!nit || !dv) return true;
  try {
    return calcularDvNit(nit) === dv;
  } catch {
    return false;
  }
}

export const configuracionFeInputSchema = z
  .object({
    activa: casilla,
    envio: z.enum(["AUTOMATICO", "MANUAL"]),
    ambiente: z.enum(["SIMULADO", "PRUEBAS", "PRODUCCION"]),
    cuenta: z.enum(["BOLSA", "PROPIA"]),
    token: z.string().transform((v) => v.trim()),
    nit: textoOpcional.refine((v) => v === null || /^\d{5,15}$/.test(v), "El NIT va sin puntos, guiones ni DV."),
    dv: textoOpcional.refine((v) => v === null || /^\d$/.test(v), "El DV es un solo dígito."),
    razonSocial: textoOpcional,
    regimen: textoOpcional.refine((v) => v === null || v === "48" || v === "49", "Régimen inválido."),
    responsabilidadFiscal: responsabilidadOpcional,
    municipioCodigo: municipioOpcional,
    direccion: textoOpcional,
    resolucionNumero: textoOpcional,
    prefijo: textoOpcional.refine((v) => v === null || /^[A-Za-z0-9]{1,4}$/.test(v), "El prefijo tiene hasta 4 letras o números."),
    rangoDesde: enteroOpcional,
    rangoHasta: enteroOpcional,
    vigenciaDesde: diaOpcional,
    vigenciaHasta: diaOpcional,
    prefijoNotaCredito: textoOpcional.refine(
      (v) => v === null || /^[A-Za-z0-9]{1,4}$/.test(v),
      "El prefijo de notas crédito tiene hasta 4 letras o números.",
    ),
    resultadoSimulado: z.enum(["ACEPTAR", "RECHAZAR", "CAIDA", "CAIDA_RECIBIDO"]),
    confirmarProduccion: z.string(),
  })
  .refine((d) => dvCorresponde(d.nit, d.dv), { message: "El dígito de verificación no corresponde al NIT.", path: ["dv"] })
  .refine((d) => d.rangoDesde === null || d.rangoHasta === null || d.rangoDesde <= d.rangoHasta, {
    message: "El rango de la resolución está al revés.",
    path: ["rangoHasta"],
  })
  .refine((d) => d.vigenciaDesde === null || d.vigenciaHasta === null || d.vigenciaDesde <= d.vigenciaHasta, {
    message: "La vigencia de la resolución está al revés.",
    path: ["vigenciaHasta"],
  });

export type ConfiguracionFeInput = z.output<typeof configuracionFeInputSchema>;

export const datosFeClienteSchema = z.object({
  tipoDocumento: textoOpcional.refine((v) => v === null || tiene(TIPOS_DOCUMENTO_IDENTIDAD, v), "Tipo de documento desconocido."),
  dv: textoOpcional.refine((v) => v === null || /^\d$/.test(v), "El DV es un solo dígito."),
  tipoPersona: textoOpcional.refine((v) => v === null || v === "NATURAL" || v === "JURIDICA", "Tipo de persona inválido.").transform(
    (v) => v as "NATURAL" | "JURIDICA" | null,
  ),
  responsabilidadFiscal: responsabilidadOpcional,
  municipioCodigo: municipioOpcional,
  direccion: textoOpcional,
});

export type DatosFeClienteInput = z.output<typeof datosFeClienteSchema>;
