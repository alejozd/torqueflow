import { IconoWhatsapp } from "@/components/icono-whatsapp";
import type { ReactNode } from "react";
import { CalendarClock, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PlacaVehiculo } from "@/components/placa-vehiculo";
import { avisoVencimiento } from "@/lib/cotizacion/vencimiento";
import { urlWhatsapp } from "@/lib/whatsapp/url";
import { cn } from "@/lib/utils";
import type { EstadoCotizacion } from "@/generated/prisma-tenant";

// Misma convención BORRADOR/ENVIADA/APROBADA/RECHAZADA/VENCIDA que el listado
// (cotizaciones/page.tsx), que guarda su propia copia.
export const ESTADO_LABELS: Record<EstadoCotizacion, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  VENCIDA: "Vencida",
};

const ESTADO_BADGE_VARIANT: Partial<Record<EstadoCotizacion, "outline" | "destructive" | "default">> = {
  BORRADOR: "outline",
  RECHAZADA: "destructive",
  VENCIDA: "default",
};

const ESTADO_BADGE_CLASSNAME: Record<EstadoCotizacion, string> = {
  BORRADOR: "",
  ENVIADA: "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[oklch(0.44_0.12_250)]",
  APROBADA: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  RECHAZADA: "",
  VENCIDA: "",
};

const ESTADO_DOT_COLOR: Record<EstadoCotizacion, string> = {
  BORRADOR: "oklch(0.7 0 0)",
  ENVIADA: "oklch(0.44 0.12 250)",
  APROBADA: "oklch(0.4 0.1 150)",
  RECHAZADA: "var(--destructive)",
  VENCIDA: "var(--primary-foreground)",
};

const TONO_VENCIMIENTO = {
  normal: "border-border text-muted-foreground",
  aviso: "border-[oklch(0.75_0.15_75/0.5)] bg-[oklch(0.75_0.15_75/0.12)] text-[oklch(0.5_0.13_65)]",
  vencida: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });
const formatoFechaHora = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export interface DatosCabeceraCotizacion {
  numero: number;
  estado: EstadoCotizacion;
  creada: Date;
  creadoPor: string;
  validaHasta: Date | null;
  sede: string;
  motivo: string;
  placa: string;
  marca: string;
  modelo: string;
  anio: number | null;
  color: string | null;
  cliente: string;
  telefono: string | null;
  email: string | null;
}

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
 * Cabecera de la cotización con el mismo orden que la de la orden: placa y
 * vehículo, cliente con sus contactos, y debajo los datos de la cotización. El
 * vencimiento solo se avisa mientras la cotización sigue abierta.
 */
export function CabeceraCotizacion({
  datos,
  ahora,
  acciones,
}: {
  datos: DatosCabeceraCotizacion;
  ahora: Date;
  acciones: ReactNode;
}) {
  const placa = datos.placa.toUpperCase();
  const vehiculo = [`${datos.marca} ${datos.modelo}${datos.anio ? ` ${datos.anio}` : ""}`, datos.color]
    .filter(Boolean)
    .join(" · ");
  const whatsapp = urlWhatsapp(
    datos.telefono,
    `Hola ${datos.cliente}, te escribimos del taller por la cotización #${datos.numero} de tu vehículo ${placa}.`,
  );
  const abierta = datos.estado === "BORRADOR" || datos.estado === "ENVIADA";
  const vencimiento = abierta && datos.validaHasta ? avisoVencimiento(datos.validaHasta, ahora) : null;

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
          {vencimiento && datos.validaHasta ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                TONO_VENCIMIENTO[vencimiento.tono],
              )}
              title={`Válida hasta ${formatoFecha.format(datos.validaHasta)}`}
            >
              <CalendarClock className="size-3.5" aria-hidden />
              {vencimiento.texto}
            </span>
          ) : null}
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
            <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm hover:underline">
              <IconoWhatsapp className="size-3.5" aria-hidden />
              WhatsApp
            </a>
          ) : null}
          {datos.email ? <span className="text-sm text-muted-foreground">{datos.email}</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-sm">
          <Dato etiqueta="Creada">
            <span className="font-medium">{formatoFechaHora.format(datos.creada)}</span>
          </Dato>
          <Dato etiqueta="Por">
            <span className="font-medium">{datos.creadoPor}</span>
          </Dato>
          <Dato etiqueta="Sede">
            <span className="font-medium">{datos.sede}</span>
          </Dato>
        </div>
        {datos.motivo.trim() ? (
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Motivo: </span>
            {datos.motivo}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col items-start gap-2 md:items-end">
        <span className="font-mono text-xs text-muted-foreground">Cotización #{datos.numero}</span>
        {acciones}
      </div>
    </Card>
  );
}
