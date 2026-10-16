"use client";

import { IconoWhatsapp } from "@/components/icono-whatsapp";
import { Button } from "@/components/ui/button";

/** Abre el wa.me de cobro. Sin teléfono, queda deshabilitado con la razón en el tooltip. */
export function CobrarWhatsappButton({ urlWhatsapp }: { urlWhatsapp: string | null }) {
  function cobrar() {
    if (!urlWhatsapp) return;
    // Must run synchronously in the click handler: popup blockers swallow
    // window.open calls made after an await.
    window.open(urlWhatsapp, "_blank", "noopener");
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={cobrar}
      disabled={!urlWhatsapp}
      title={urlWhatsapp ? undefined : "El cliente no tiene teléfono registrado"}
    >
      <IconoWhatsapp className="size-4" />
      Cobrar por WhatsApp
    </Button>
  );
}
