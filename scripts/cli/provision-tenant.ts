import "dotenv/config";
import { provisionTenant } from "../provision-tenant";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: npm run tenant:provision -- <slug>");
  process.exit(1);
}
const schemaName = slug.replace(/-/g, "_");

provisionTenant({ slug, schemaName })
  .then((tenant) => {
    console.log(`Provisioned tenant "${tenant.slug}" -> schema "${tenant.schemaName}"`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
