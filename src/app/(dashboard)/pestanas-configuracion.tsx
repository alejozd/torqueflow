import Link from "next/link";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { href: "/configuracion-smtp", label: "Correo y avisos" },
  { href: "/configuracion-iva", label: "Tarifas de IVA" },
] as const;

export type PestanaConfiguracion = (typeof PESTANAS)[number]["href"];

/**
 * Encabezado común de "Configuración del taller": el título y las pestañas que
 * llevan a cada página. Cada pestaña es su propia ruta, así los enlaces que ya
 * apuntan a /configuracion-smtp siguen sirviendo.
 */
export function EncabezadoConfiguracion({ actual }: { actual: PestanaConfiguracion }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Configuración del taller</h1>
      <nav aria-label="Secciones de la configuración" className="flex gap-1 self-start rounded-xl border border-border bg-muted p-1">
        {PESTANAS.map((pestana) => {
          const activa = pestana.href === actual;
          return (
            <Link
              key={pestana.href}
              href={pestana.href}
              aria-current={activa ? "page" : undefined}
              className={cn(
                "inline-flex items-center rounded-lg px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors",
                activa ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
              )}
            >
              {pestana.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
