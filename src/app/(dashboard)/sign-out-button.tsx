"use client";

import { cerrarSesion } from "@/lib/auth/cerrar-sesion";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void cerrarSesion("/login")}
    >
      <LogOut />
      Cerrar sesión
    </Button>
  );
}
