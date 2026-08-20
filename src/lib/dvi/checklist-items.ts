export const DVI_CHECKLIST_ITEMS = [
  { key: "luces", label: "Luces (altas, bajas, direccionales)" },
  { key: "frenos", label: "Frenos" },
  { key: "llantas", label: "Llantas y presión" },
  { key: "niveles_fluidos", label: "Niveles de fluidos (aceite, refrigerante, frenos)" },
  { key: "bateria", label: "Batería" },
  { key: "suspension", label: "Suspensión" },
  { key: "correas_mangueras", label: "Correas y mangueras" },
  { key: "limpiaparabrisas", label: "Limpiaparabrisas" },
] as const;

export type DviChecklistKey = (typeof DVI_CHECKLIST_ITEMS)[number]["key"];

export const DVI_CHECKLIST_STATUSES = ["OK", "ATENCION", "CRITICO", "NO_APLICA"] as const;

export type DviChecklistStatus = (typeof DVI_CHECKLIST_STATUSES)[number];

export type DviChecklist = Partial<Record<DviChecklistKey, DviChecklistStatus>>;
