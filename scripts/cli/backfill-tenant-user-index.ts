import "dotenv/config";
import { backfillTenantUserIndex } from "../backfill-tenant-user-index";

backfillTenantUserIndex()
  .then((result) => {
    console.log(`Inserted ${result.inserted} email(s), ${result.alreadyCorrect} already correct.`);
    if (result.conflicts.length === 0) {
      process.exit(0);
    }
    console.error(`Found ${result.conflicts.length} conflict(s) -- email already indexed under a different tenant:`);
    for (const c of result.conflicts) {
      console.error(
        `  ${c.email}: indexed tenantId=${c.existingTenantId}, but found in tenant "${c.foundTenantSlug}" (${c.foundTenantId})`,
      );
    }
    process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
