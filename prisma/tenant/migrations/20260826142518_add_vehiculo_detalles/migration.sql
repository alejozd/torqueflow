-- CreateEnum
CREATE TYPE "TipoCombustible" AS ENUM ('GASOLINA', 'DIESEL', 'HIBRIDO', 'ELECTRICO');

-- CreateEnum
CREATE TYPE "TipoTransmision" AS ENUM ('AUTOMATICA', 'MECANICA');

-- AlterTable
ALTER TABLE "vehiculos" ADD COLUMN     "combustible" "TipoCombustible",
ADD COLUMN     "kilometraje" INTEGER,
ADD COLUMN     "observaciones" TEXT,
ADD COLUMN     "proximo_mantenimiento" TIMESTAMP(3),
ADD COLUMN     "transmision" "TipoTransmision";
