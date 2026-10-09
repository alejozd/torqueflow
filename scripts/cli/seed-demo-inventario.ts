import "dotenv/config";
import { seedDemoInventario } from "../seed-demo-inventario";

const args = process.argv.slice(2);
const schemaName = args.find((arg) => !arg.startsWith("--"));
const correoArg = args.find((arg) => arg.startsWith("--correo="));
const correoPruebas = correoArg?.slice("--correo=".length) || undefined;

if (!schemaName) {
  console.error("Usage: npm run inventario:seed-demo -- <schemaName> [--correo=tu@correo.com]");
  console.error("Dev/staging only: invents sales history. Run after repuestos:seed and clientes:seed.");
  process.exit(1);
}

seedDemoInventario({ schemaName, correoPruebas })
  .then((result) => {
    console.log(`Demo de inventario en "${schemaName}":`, result);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
