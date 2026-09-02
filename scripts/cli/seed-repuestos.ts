import "dotenv/config";
import { seedRepuestos } from "../seed-repuestos";

const [schemaName, countArg, bodegaId] = process.argv.slice(2);

if (!schemaName) {
  console.error("Usage: npm run repuestos:seed -- <schemaName> [count] [bodegaId]");
  process.exit(1);
}

// Parse count, default to 150
let count = 150;
if (countArg) {
  const parsed = parseInt(countArg, 10);
  if (!isNaN(parsed) && parsed > 0) {
    count = parsed;
  }
}

seedRepuestos({
  schemaName,
  count,
  bodegaId,
})
  .then((result) => {
    console.log(
      `Seeded ${result.created} repuestos into schema "${schemaName}" (bodega ${result.bodegaId})`
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
