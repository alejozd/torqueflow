"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/**
 * Imprime con el navegador, como la cotización y el acta. Con `automatico` abre
 * el diálogo de impresión al cargar: así la tecla P de la venta cobrada imprime
 * de una vez. La marca evita que el modo estricto de React (que monta dos veces
 * en desarrollo) abra el diálogo dos veces.
 */
export function ImprimirButton({ automatico = false }: { automatico?: boolean }) {
  const yaImprimio = useRef(false);

  useEffect(() => {
    if (!automatico || yaImprimio.current) return;
    yaImprimio.current = true;
    window.print();
  }, [automatico]);

  return (
    <Button type="button" onClick={() => window.print()}>
      Imprimir
    </Button>
  );
}
