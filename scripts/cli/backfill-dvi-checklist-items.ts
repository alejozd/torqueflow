import "dotenv/config";
import { backfillDviChecklistItems } from "../backfill-dvi-checklist-items";

backfillDviChecklistItems()
  .then((result) => {
    console.log(`Seeded ${result.seeded} tenant(s), ${result.alreadySeeded} already had items.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
