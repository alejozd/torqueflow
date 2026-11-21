// src/lib/factura-electronica/almacenamiento.ts
import type { ProveedorFacturaElectronica, ReferenciaDocumento } from "@/modulos/factura-electronica";
import { saveDocumentoElectronico } from "@/lib/storage/local-file-storage";

export interface ArchivosGuardados {
  /** URL de /api/uploads/…; null si no se pudo descargar o guardar. */
  xmlRuta: string | null;
  pdfRuta: string | null;
  errores: string[];
}

/** Mismo nombre que usa Nextpyme para sus archivos. */
const PREFIJO_NOMBRE = { FACTURA: "FES", NOTA_CREDITO: "NCS" } as const;

/**
 * Descarga del proveedor y guarda el XML y el PDF (Nextpyme los guarda solo un año; nosotros
 * siempre). Nunca lanza: un archivo que falle queda en null y el documento sigue ACEPTADO (spec §7).
 */
export async function guardarArchivosDocumento(
  proveedor: ProveedorFacturaElectronica,
  ref: ReferenciaDocumento,
  tenantSchema: string,
  documentoId: string,
): Promise<ArchivosGuardados> {
  const resultado: ArchivosGuardados = { xmlRuta: null, pdfRuta: null, errores: [] };
  for (const formato of ["XML", "PDF"] as const) {
    const nombre = `${PREFIJO_NOMBRE[ref.tipo]}-${ref.prefijo}${ref.numero}.${formato.toLowerCase()}`;
    try {
      const bytes = await proveedor.descargar(ref, formato);
      const guardado = await saveDocumentoElectronico(tenantSchema, documentoId, nombre, bytes);
      if (formato === "XML") resultado.xmlRuta = guardado.url;
      else resultado.pdfRuta = guardado.url;
    } catch (e) {
      resultado.errores.push(e instanceof Error ? e.message : String(e));
    }
  }
  return resultado;
}
