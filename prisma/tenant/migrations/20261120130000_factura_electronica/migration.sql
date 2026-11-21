-- Facturación electrónica DIAN (fase-fe, Plan 2a). Todo es aditivo: los talleres
-- que no la activan no notan nada. La tabla de facturas no cambia de columnas.

-- CreateEnum
CREATE TYPE "EnvioFacturaElectronica" AS ENUM ('AUTOMATICO', 'MANUAL');

-- CreateEnum
CREATE TYPE "AmbienteFacturaElectronica" AS ENUM ('SIMULADO', 'PRUEBAS', 'PRODUCCION');

-- CreateEnum
CREATE TYPE "CuentaFacturaElectronica" AS ENUM ('BOLSA', 'PROPIA');

-- CreateEnum
CREATE TYPE "ResultadoSimuladoFacturaElectronica" AS ENUM ('ACEPTAR', 'RECHAZAR', 'CAIDA', 'CAIDA_RECIBIDO');

-- CreateEnum
CREATE TYPE "TipoPersonaCliente" AS ENUM ('NATURAL', 'JURIDICA');

-- CreateEnum
CREATE TYPE "TipoDocumentoElectronico" AS ENUM ('FACTURA', 'NOTA_CREDITO');

-- CreateEnum
CREATE TYPE "EstadoDocumentoElectronico" AS ENUM ('PENDIENTE', 'ENVIANDO', 'POR_CONFIRMAR', 'ACEPTADO', 'RECHAZADO', 'ANULADO');

-- Datos del cliente para la factura electrónica: opcionales, los clientes existentes quedan en blanco.
-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "dv" TEXT,
ADD COLUMN     "municipio_codigo" TEXT,
ADD COLUMN     "responsabilidad_fiscal" TEXT,
ADD COLUMN     "tipo_documento" TEXT,
ADD COLUMN     "tipo_persona" "TipoPersonaCliente";

-- Configuración (una sola fila, id 'singleton'); nace inactiva y en ambiente simulado.
-- CreateTable
CREATE TABLE "configuracion_factura_electronica" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "envio" "EnvioFacturaElectronica" NOT NULL DEFAULT 'AUTOMATICO',
    "ambiente" "AmbienteFacturaElectronica" NOT NULL DEFAULT 'SIMULADO',
    "cuenta" "CuentaFacturaElectronica" NOT NULL DEFAULT 'BOLSA',
    "token_cifrado" TEXT,
    "nit" TEXT,
    "dv" TEXT,
    "razon_social" TEXT,
    "regimen" TEXT,
    "responsabilidad_fiscal" TEXT,
    "municipio_codigo" TEXT,
    "direccion" TEXT,
    "resolucion_numero" TEXT,
    "prefijo" TEXT,
    "rango_desde" INTEGER,
    "rango_hasta" INTEGER,
    "vigencia_desde" DATE,
    "vigencia_hasta" DATE,
    "siguiente_consecutivo" INTEGER NOT NULL DEFAULT 1,
    "prefijo_nota_credito" TEXT,
    "siguiente_consecutivo_nota_credito" INTEGER NOT NULL DEFAULT 1,
    "resultado_simulado" "ResultadoSimuladoFacturaElectronica" NOT NULL DEFAULT 'ACEPTAR',
    "ultima_prueba_at" TIMESTAMP(3),
    "ultima_prueba_exitosa" BOOLEAN,
    "ultima_prueba_mensaje" TEXT,
    "ambiente_proveedor" "AmbienteFacturaElectronica",
    "activada_desde" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_factura_electronica_pkey" PRIMARY KEY ("id")
);

-- Documentos enviados a la DIAN. Un número de la resolución no se repite por tipo, ambiente y prefijo.
-- CreateTable
CREATE TABLE "documentos_electronicos" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDocumentoElectronico" NOT NULL,
    "factura_id" TEXT NOT NULL,
    "documento_referencia_id" TEXT,
    "prefijo" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoDocumentoElectronico" NOT NULL DEFAULT 'PENDIENTE',
    "cufe" TEXT,
    "fecha_validacion" TIMESTAMP(3),
    "mensajes" JSONB NOT NULL DEFAULT '[]',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_intento_at" TIMESTAMP(3),
    "xml_ruta" TEXT,
    "pdf_ruta" TEXT,
    "payload" JSONB NOT NULL,
    "ambiente" "AmbienteFacturaElectronica" NOT NULL,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentos_electronicos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_electronicos_factura_id_idx" ON "documentos_electronicos"("factura_id");

-- CreateIndex
CREATE INDEX "documentos_electronicos_estado_idx" ON "documentos_electronicos"("estado");

-- CreateIndex
CREATE INDEX "documentos_electronicos_documento_referencia_id_idx" ON "documentos_electronicos"("documento_referencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_electronicos_tipo_ambiente_prefijo_numero_key" ON "documentos_electronicos"("tipo", "ambiente", "prefijo", "numero");

-- AddForeignKey
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_documento_referencia_id_fkey" FOREIGN KEY ("documento_referencia_id") REFERENCES "documentos_electronicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
