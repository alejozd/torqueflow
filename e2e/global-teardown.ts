import "dotenv/config";
import { publicDb } from "../src/lib/db/public-client";
import { E2E_SLUG, E2E_SCHEMA } from "./global-setup";

export default async function globalTeardown() {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: E2E_SLUG } });
}
