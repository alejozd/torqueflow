import "dotenv/config";
import { seedClientes } from "../seed-clientes";

const [schemaName, countArg] = process.argv.slice(2);

if (!schemaName) {
  console.error("Usage: npm run clientes:seed -- <schemaName> [count]");
  process.exit(1);
}

// Parse count, default to 20
let count = 20;
if (countArg) {
  const parsed = parseInt(countArg, 10);
  if (!isNaN(parsed) && parsed > 0) {
    count = parsed;
  }
}

seedClientes({
  schemaName,
  count,
})
  .then((result) => {
    console.log(
      `Seeded ${result.created} clientes into schema "${schemaName}" (${result.skipped} already existed, skipped)`
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
