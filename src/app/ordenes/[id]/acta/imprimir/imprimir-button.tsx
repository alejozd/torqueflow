"use client";

import { Button } from "@/components/ui/button";

export function ImprimirButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      Imprimir
    </Button>
  );
}
