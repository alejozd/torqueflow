-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('PROGRAMADA', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA');

-- CreateEnum
CREATE TYPE "MotivoRecordatorio" AS ENUM ('KILOMETRAJE', 'TIEMPO');

-- CreateTable
CREATE TABLE "citas" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "vehiculo_id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "fecha_hora" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoCita" NOT NULL DEFAULT 'PROGRAMADA',
    "motivo" TEXT NOT NULL,
    "notas" TEXT,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "citas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_smtp" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "host" TEXT NOT NULL,
    "puerto" INTEGER NOT NULL,
    "usuario" TEXT NOT NULL,
    "password_cifrado" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_smtp_pkey" PRIMARY KEY ("id")
);

-- Enforce the singleton in the database, not just in application code: one
-- tenant schema means one SMTP server, and a second row would silently make
-- "which config does the reminder job use?" ambiguous.
ALTER TABLE "configuracion_smtp"
    ADD CONSTRAINT "configuracion_smtp_id_singleton" CHECK ("id" = 'singleton');

-- CreateTable
CREATE TABLE "recordatorios_enviados" (
    "id" TEXT NOT NULL,
    "vehiculo_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "email_destino" TEXT NOT NULL,
    "motivo" "MotivoRecordatorio" NOT NULL,
    "enviado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordatorios_enviados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "citas_sede_id_idx" ON "citas"("sede_id");

-- CreateIndex
CREATE INDEX "citas_cliente_id_idx" ON "citas"("cliente_id");

-- CreateIndex
CREATE INDEX "citas_vehiculo_id_idx" ON "citas"("vehiculo_id");

-- CreateIndex
CREATE INDEX "citas_fecha_hora_idx" ON "citas"("fecha_hora");

-- CreateIndex
CREATE INDEX "recordatorios_enviados_vehiculo_id_enviado_at_idx" ON "recordatorios_enviados"("vehiculo_id", "enviado_at");

-- CreateIndex
CREATE INDEX "recordatorios_enviados_cliente_id_idx" ON "recordatorios_enviados"("cliente_id");

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios_enviados" ADD CONSTRAINT "recordatorios_enviados_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios_enviados" ADD CONSTRAINT "recordatorios_enviados_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
