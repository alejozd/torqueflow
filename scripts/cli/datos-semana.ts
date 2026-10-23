import "dotenv/config";
import { main } from "../datos-semana";

main(process.argv.slice(2))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
