-- AlterTable: add "valor" nullable first so existing rows can be backfilled
ALTER TABLE "mano_de_obra" ADD COLUMN     "valor" DECIMAL(10,2);

-- Backfill: preserve each existing line's money value (horas x precio_hora)
UPDATE "mano_de_obra" SET "valor" = "horas" * "precio_hora";

-- Enforce NOT NULL now that every row has a value
ALTER TABLE "mano_de_obra" ALTER COLUMN "valor" SET NOT NULL;

-- Drop the columns this change removes
ALTER TABLE "mano_de_obra" DROP COLUMN "horas";
ALTER TABLE "mano_de_obra" DROP COLUMN "precio_hora";
