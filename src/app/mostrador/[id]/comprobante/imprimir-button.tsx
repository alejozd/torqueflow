"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Imprime con el navegador, como la cotización y el acta. Con `automatico` abre
 * el diálogo de impresión al cargar: así la tecla P de la venta cobrada imprime
 * de una vez.
 */
export function ImprimirButton({ automatico = false }: { automatico?: boolean }) {
  useEffect(() => {
    if (automatico) window.print();
  }, [automatico]);

  return (
    <Button type="button" onClick={() => window.print()}>
      Imprimir
    </Button>
  );
}
