import "dotenv/config";
import { seedSuperAdmin } from "../seed-super-admin";

const [email, password, nombre] = process.argv.slice(2);
if (!email || !password || !nombre) {
  console.error("Usage: npm run superadmin:seed -- <email> <password> <nombre>");
  process.exit(1);
}

seedSuperAdmin({ email, password, nombre })
  .then((admin) => {
    console.log(`Seeded super-admin "${admin.email}"`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
