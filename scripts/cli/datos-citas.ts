import "dotenv/config";
import { mainCitasFuturas } from "../datos-semana/citas-futuras";

mainCitasFuturas()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
