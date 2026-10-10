"use client";

import { useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { registrarAvisoWhatsappAction } from "@/app/actions/vencimiento-actions";
import { Button } from "@/components/ui/button";
import type { TipoDocumento } from "@/lib/vencimientos/estado-vencimiento";

export function AvisarWhatsappButton({
  vehiculoId,
  tipo,
  urlWhatsapp,
}: {
  vehiculoId: string;
  tipo: TipoDocumento;
  urlWhatsapp: string | null;
}) {
  const [pendiente, startTransition] = useTransition();

  function avisar() {
    if (!urlWhatsapp) return;
    // Must run synchronously in the click handler: popup blockers swallow
    // window.open calls made after an await.
    window.open(urlWhatsapp, "_blank", "noopener");
    startTransition(async () => {
      try {
        const resultado = await registrarAvisoWhatsappAction(vehiculoId, tipo);
        if (resultado.error) toast.error(resultado.error);
        else toast.success("Aviso registrado");
      } catch {
        toast.error("No se pudo registrar el aviso");
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={avisar}
      disabled={pendiente || !urlWhatsapp}
      title={urlWhatsapp ? undefined : "El cliente no tiene teléfono registrado"}
    >
      <MessageCircle className="size-4" />
      Avisar por WhatsApp
    </Button>
  );
}
