import "dotenv/config";
import { checkDuplicateEmails } from "../check-duplicate-emails";

checkDuplicateEmails()
  .then((duplicates) => {
    if (duplicates.length === 0) {
      console.log("No duplicate emails across tenants. Safe to proceed with the Fase 10 migration.");
      process.exit(0);
    }
    console.error(`Found ${duplicates.length} email(s) duplicated across tenants:`);
    for (const { email, tenantSlugs } of duplicates) {
      console.error(`  ${email} -> ${tenantSlugs.join(", ")}`);
    }
    process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
