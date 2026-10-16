import { IconoWhatsapp } from "@/components/icono-whatsapp";
import type { ReactNode } from "react";
import { Phone, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PlacaVehiculo } from "@/components/placa-vehiculo";
import { ETIQUETA_TIPO_VEHICULO } from "@/lib/validation/vehiculo";
import { urlWhatsapp } from "@/lib/whatsapp/url";
import { cn } from "@/lib/utils";
import type { EstadoOrden, TipoVehiculo } from "@/generated/prisma-tenant";
import { ESTADO_BADGE_CLASSNAME, ESTADO_BADGE_VARIANT, ESTADO_DOT_COLOR, ESTADO_LABELS } from "../estado-tono";

export interface DatosCabecera {
  id: string;
  estado: EstadoOrden;
  ingreso: Date;
  sede: string;
  recibio: string;
  placa: string;
  marca: string;
  modelo: string;
  anio: number | null;
  color: string | null;
  tipo: TipoVehiculo;
  cliente: string;
  telefono: string | null;
}

const formatoFechaHora = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

/** 3100000259 → 310 000 0259 (celular de Colombia); otros números quedan como vienen. */
function telefonoLegible(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  return digitos.length === 10 ? `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}` : telefono;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{etiqueta}</span>
      {children}
    </span>
  );
}

/**
 * La cabecera dice de quién y de qué carro es la orden sin abrir nada (antes
 * estaba repartido en «Información»), y a la derecha va lo que sigue.
 */
export function CabeceraOrden({
  datos,
  mecanico,
  acciones,
}: {
  datos: DatosCabecera;
  mecanico: ReactNode;
  acciones: ReactNode;
}) {
  const vehiculo = [
    `${datos.marca} ${datos.modelo}${datos.anio ? ` ${datos.anio}` : ""}`,
    datos.color,
    ETIQUETA_TIPO_VEHICULO[datos.tipo],
  ]
    .filter(Boolean)
    .join(" · ");
  const placa = datos.placa.toUpperCase();
  const whatsapp = urlWhatsapp(datos.telefono, `Hola ${datos.cliente}, te escribimos del taller por tu vehículo ${placa}.`);

  return (
    <Card className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <PlacaVehiculo placa={placa} />
          <span className="text-base text-muted-foreground">{vehiculo}</span>
          <Badge
            variant={ESTADO_BADGE_VARIANT[datos.estado]}
            className={cn("gap-1.5", ESTADO_BADGE_CLASSNAME[datos.estado])}
          >
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: ESTADO_DOT_COLOR[datos.estado] }} />
            {ESTADO_LABELS[datos.estado]}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="text-[15px] font-semibold">{datos.cliente}</span>
          {datos.telefono ? (
            <a
              href={`tel:${datos.telefono.replace(/\D/g, "")}`}
              className="inline-flex items-center gap-1.5 font-mono text-sm hover:underline"
            >
              <Phone className="size-3.5" aria-hidden />
              {telefonoLegible(datos.telefono)}
            </a>
          ) : null}
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm hover:underline"
            >
              <IconoWhatsapp className="size-3.5 text-[oklch(0.55_0.15_150)]" aria-hidden />
              WhatsApp
            </a>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-sm">
          <Dato etiqueta="Ingresó">
            <span className="font-medium">{formatoFechaHora.format(datos.ingreso)}</span>
          </Dato>
          <Dato etiqueta="Recibió">
            <span className="font-medium">{datos.recibio}</span>
          </Dato>
          <Dato etiqueta="Sede">
            <span className="font-medium">{datos.sede}</span>
          </Dato>
          <Dato etiqueta="Mecánico">{mecanico}</Dato>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 md:items-end">
        <span className="font-mono text-xs text-muted-foreground">Orden #{datos.id.slice(-8).toUpperCase()}</span>
        {acciones}
      </div>
    </Card>
  );
}

/** Lo que reportó el cliente, siempre a la vista: es lo primero que lee el mecánico. */
export function BannerSintomas({ sintomas }: { sintomas: string | null }) {
  if (!sintomas?.trim()) return null;
  return (
    <section
      aria-label="Síntomas reportados"
      className="flex items-start gap-3 rounded-xl border border-l-4 border-border border-l-[oklch(0.55_0.15_60)] bg-[oklch(0.55_0.15_60/0.06)] px-4 py-3"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[oklch(0.55_0.15_60)] text-white">
        <TriangleAlert className="size-4" aria-hidden />
      </span>
      <div>
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">El cliente reporta</p>
        <p className="mt-0.5 text-[15px]">{sintomas}</p>
      </div>
    </section>
  );
}
