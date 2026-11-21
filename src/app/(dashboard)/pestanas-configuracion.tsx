import Link from "next/link";
import { cn } from "@/lib/utils";
import { tienePermiso, type Permiso } from "@/lib/auth/permisos";

const PESTANAS = [
  { href: "/configuracion-smtp", label: "Correo y avisos", permiso: "configuracion.taller" },
  { href: "/configuracion-iva", label: "Tarifas de IVA", permiso: "configuracion.taller" },
  { href: "/configuracion-factura-electronica", label: "Facturación electrónica", permiso: "facturaElectronica.configurar" },
] as const satisfies readonly { href: string; label: string; permiso: Permiso }[];

export type PestanaConfiguracion = (typeof PESTANAS)[number]["href"];

/**
 * Encabezado común de "Configuración del taller": el título y las pestañas que
 * llevan a cada página. Cada pestaña es su propia ruta, así los enlaces que ya
 * apuntan a /configuracion-smtp siguen sirviendo. Con `permisos`, solo se
 * muestran las pestañas a las que el usuario puede entrar (quien solo configura
 * la facturación electrónica no ve Correo ni IVA).
 */
export function EncabezadoConfiguracion({
  actual,
  permisos,
}: {
  actual: PestanaConfiguracion;
  permisos?: readonly Permiso[];
}) {
  const visibles = permisos ? PESTANAS.filter((p) => tienePermiso(permisos, p.permiso)) : PESTANAS;
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Configuración del taller</h1>
      <nav aria-label="Secciones de la configuración" className="flex gap-1 self-start rounded-xl border border-border bg-muted p-1">
        {visibles.map((pestana) => {
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
