import Link from "next/link";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/guards";
import { SignOutButton } from "./sign-out-button";
import { CambiarSedeButton } from "./cambiar-sede-button";
import { DashboardSessionProvider } from "./dashboard-session-provider";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const esAdmin = session.user.role === "ADMIN";

  return (
    <DashboardSessionProvider>
      <div style={{ padding: "2rem" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <nav style={{ display: "flex", gap: "1rem" }}>
            <Link href="/clientes">Clientes</Link>
            <Link href="/ordenes">Órdenes</Link>
            <Link href="/citas">Citas</Link>
            <Link href="/bodegas">Bodegas</Link>
            <Link href="/proveedores">Proveedores</Link>
            <Link href="/repuestos">Repuestos</Link>
            <Link href="/entradas-mercancia">Entradas</Link>
            <Link href="/facturas">Facturas</Link>
            {esAdmin ? <Link href="/reportes">Reportes</Link> : null}
            {esAdmin ? <Link href="/sedes">Sedes</Link> : null}
            {esAdmin ? <Link href="/usuarios">Usuarios</Link> : null}
            {esAdmin ? <Link href="/configuracion-smtp">SMTP</Link> : null}
          </nav>
          <span>
            Sesión: {session.user.email} — {session.user.tenantSlug}
          </span>
          {/* The sede activa scopes everything below this header, so it is shown
              on every page rather than only on /sedes. */}
          <span>Sede: {session.user.sedeActivaNombre}</span>
          <CambiarSedeButton />
          <SignOutButton />
        </header>
        {children}
      </div>
    </DashboardSessionProvider>
  );
}
