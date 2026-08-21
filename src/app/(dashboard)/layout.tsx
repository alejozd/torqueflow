import Link from "next/link";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/guards";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return (
    <div style={{ padding: "2rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/clientes">Clientes</Link>
          <Link href="/ordenes">Órdenes</Link>
          <Link href="/bodegas">Bodegas</Link>
          <Link href="/proveedores">Proveedores</Link>
          <Link href="/repuestos">Repuestos</Link>
          <Link href="/entradas-mercancia">Entradas</Link>
          <Link href="/facturas">Facturas</Link>
          {session.user.role === "ADMIN" ? <Link href="/reportes">Reportes</Link> : null}
        </nav>
        <span>
          Sesión: {session.user.email} — {session.user.tenantSlug}
        </span>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
