import "dotenv/config";
import { seedTenantUser } from "../seed-tenant-user";

const [schemaName, email, password, nombre, role] = process.argv.slice(2);
if (!schemaName || !email || !password || !nombre) {
  console.error("Usage: npm run tenant:seed-user -- <schemaName> <email> <password> <nombre> [role]");
  process.exit(1);
}

seedTenantUser({
  schemaName,
  email,
  password,
  nombre,
  role: role as "ADMIN" | "TECNICO" | "RECEPCION" | undefined,
})
  .then((usuario) => {
    console.log(`Seeded user "${usuario.email}" (${usuario.role}) in schema "${schemaName}"`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
