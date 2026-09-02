import { getTenantDb } from "@/lib/db/tenant-client";

export interface SeedRepuestosInput {
  schemaName: string;
  count: number;
  bodegaId?: string;
}

export interface SeedRepuestosResult {
  created: number;
  bodegaId: string;
}

// Spanish auto part categories
export const PARTES = [
  "Filtro de aceite",
  "Filtro de aire",
  "Filtro de combustible",
  "Filtro de cabina",
  "Pastillas de freno delanteras",
  "Pastillas de freno traseras",
  "Disco de freno delantero",
  "Disco de freno trasero",
  "Bujía",
  "Cable de bujía",
  "Correa de distribución",
  "Correa de accesorios",
  "Tensor de correa",
  "Amortiguador delantero",
  "Amortiguador trasero",
  "Resorte de suspensión",
  "Batería",
  "Alternador",
  "Motor de arranque",
  "Radiador",
  "Bomba de agua",
  "Termostato",
  "Sensor de oxígeno",
  "Sensor MAP",
  "Sensor de temperatura",
  "Bobina de encendido",
  "Rótula de suspensión",
  "Terminal de dirección",
  "Caja de dirección",
  "Rodamiento de rueda",
  "Kit de embrague",
  "Disco de embrague",
  "Colector de embrague",
  "Bomba de combustible",
  "Inyector de combustible",
  "Manguera de radiador",
  "Tapa de radiador",
  "Aceite de motor 5W-30",
  "Aceite de motor 20W-50",
  "Líquido de frenos DOT4",
  "Refrigerante",
  "Faro delantero",
  "Farola trasera",
  "Espejo retrovisor",
  "Plumilla limpiaparabrisas",
  "Empaque de culata",
  "Bomba de dirección hidráulica",
  "Cable de batería",
];

// Real automotive brands
export const MARCAS = [
  "Bosch",
  "Gates",
  "NGK",
  "Denso",
  "Mobil",
  "Castrol",
  "Fram",
  "Monroe",
  "Sachs",
  "Valeo",
  "Continental",
  "Brembo",
  "ACDelco",
  "Motorcraft",
  "Delphi",
  "TRW",
  "Febi",
  "Mann-Filter",
  "Champion",
  "Mahle",
];

export async function seedRepuestos({
  schemaName,
  count,
  bodegaId,
}: SeedRepuestosInput): Promise<SeedRepuestosResult> {
  const tenantDb = getTenantDb(schemaName);

  // Resolve bodegaId: use provided or find oldest bodega
  let resolvedBodegaId = bodegaId;
  if (!resolvedBodegaId) {
    const bodega = await tenantDb.bodega.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!bodega) {
      throw new Error(
        `No bodega found in schema "${schemaName}". Cannot seed repuestos without a bodega.`
      );
    }
    resolvedBodegaId = bodega.id;
  }

  let createdCount = 0;

  for (let i = 1; i <= count; i++) {
    const codigo = `SEED-${String(i).padStart(4, "0")}`;

    // Generate realistic nombre: cycle through PARTES and MARCAS
    const parteIndex = (i - 1) % PARTES.length;
    const marcaIndex = Math.floor((i - 1) / PARTES.length) % MARCAS.length;
    const nombre = `${PARTES[parteIndex]} ${MARCAS[marcaIndex]}`;

    // Generate realistic pricing
    const precioCompra = Math.floor(Math.random() * (150000 - 5000) + 5000);
    const markup = Math.random() * (1.6 - 1.2) + 1.2; // 1.2 to 1.6
    const precioVenta = Math.round(precioCompra * markup * 100) / 100;

    // Generate stock
    const stockActual = Math.floor(Math.random() * 51); // 0-50
    const stockMinimo = Math.floor(Math.random() * (10 - 2 + 1) + 2); // 2-10

    await tenantDb.repuesto.upsert({
      where: { codigo },
      update: {},
      create: {
        codigo,
        nombre,
        descripcion: null,
        precioCompra,
        precioVenta,
        stockActual,
        stockMinimo,
        bodegaId: resolvedBodegaId,
        proveedorId: null,
      },
    });

    createdCount++;
  }

  return { created: createdCount, bodegaId: resolvedBodegaId };
}
