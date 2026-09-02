import { getTenantDb } from "@/lib/db/tenant-client";

export interface SeedClientesInput {
  schemaName: string;
  count: number;
}

export interface SeedClientesResult {
  created: number;
  skipped: number;
}

// Colombian first names (mix of masculine and feminine)
export const NOMBRES = [
  "Carlos",
  "María",
  "Juan",
  "Ana",
  "Luis",
  "Laura",
  "Diego",
  "Camila",
  "Andrés",
  "Valentina",
  "Miguel",
  "Sofía",
  "Jorge",
  "Daniela",
  "Fernando",
  "Paula",
  "Ricardo",
  "Natalia",
  "Alejandro",
  "Isabella",
];

// Colombian surnames
export const APELLIDOS = [
  "Gómez",
  "Rodríguez",
  "Martínez",
  "López",
  "García",
  "Pérez",
  "González",
  "Sánchez",
  "Ramírez",
  "Torres",
  "Flórez",
  "Vargas",
  "Castro",
  "Ortiz",
  "Rojas",
  "Mendoza",
  "Herrera",
  "Jiménez",
  "Ruiz",
  "Díaz",
];

/**
 * Strip common Spanish diacritics for ASCII-safe email local-part
 */
function stripDiacritics(text: string): string {
  return text
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/í/g, "i")
    .replace(/ó/g, "o")
    .replace(/ú/g, "u")
    .replace(/ñ/g, "n");
}

export async function seedClientes({
  schemaName,
  count,
}: SeedClientesInput): Promise<SeedClientesResult> {
  const tenantDb = getTenantDb(schemaName);

  let createdCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < count; i++) {
    // Generate deterministic documento
    const documento = String(1000000000 + i);

    // Check if cliente with this documento already exists
    const existing = await tenantDb.cliente.findFirst({
      where: { documento },
    });

    if (existing) {
      skippedCount++;
      continue;
    }

    // Generate nombre from vocabulary
    const nombre = NOMBRES[i % NOMBRES.length];
    const apellido1 = APELLIDOS[i % APELLIDOS.length];
    const apellido2 = APELLIDOS[(i + 7) % APELLIDOS.length];
    const fullName = `${nombre} ${apellido1} ${apellido2}`;

    // Generate deterministic telefono: 3 + 9 digits (total 10 digits)
    const telefono = `3${String(100000000 + i * 37).padStart(9, "0")}`;

    // Generate deterministic email from ASCII-safe name
    const nombreAscii = stripDiacritics(nombre);
    const apellido1Ascii = stripDiacritics(apellido1);
    const email = `${nombreAscii.toLowerCase()}.${apellido1Ascii.toLowerCase()}${i}@example.com`;

    await tenantDb.cliente.create({
      data: {
        nombre: fullName,
        documento,
        telefono,
        email,
      },
    });

    createdCount++;
  }

  return { created: createdCount, skipped: skippedCount };
}
