"use client";

import { Button } from "@/components/ui/button";

export function ExportarCitasButton({ csv, filename }: { csv: string; filename: string }) {
  function exportar() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = filename;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={exportar}>
      Exportar
    </Button>
  );
}
