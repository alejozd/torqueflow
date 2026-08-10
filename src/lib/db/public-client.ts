import { PrismaClient } from "@/generated/prisma-public";

declare global {
  // eslint-disable-next-line no-var
  var __torqueflowPublicPrisma: PrismaClient | undefined;
}

export const publicDb: PrismaClient =
  globalThis.__torqueflowPublicPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__torqueflowPublicPrisma = publicDb;
}
