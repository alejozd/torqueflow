"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  enviarFacturaDianAction,
  reenviarDocumentoAction,
  type EnvioFeState,
  type FacturaFeVista,
} from "@/app/actions/factura-electronica-actions";
import { estadoDian, textoEstadoDian, type TonoDian } from "@/lib/factura-electronica/textos";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReenviarAlCliente } from "./reenviar-al-cliente";
import { NotaCreditoSeccion } from "./nota-credito-seccion";
import { formatoFechaCorta } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";

const inicial: EnvioFeState = { error: null, success: false, mensaje: null, errores: [] };

const CLASE_TONO: Record<TonoDian, string> = {
  exito: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  alerta: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  error: "border-transparent bg-destructive/10 text-destructive",
  neutro: "",
};

export function FacturaElectronicaCard({
  facturaId,
  clienteId,
  correoCliente,
  vista,
  puedeFacturar,
  puedeConfigurar,
  puedeAnular,
  cobrado,
  ahora,
}: {
  facturaId: string;
  clienteId: string;
  /** Correo del cliente: sin él no se puede reenviar la copia. */
  correoCliente: string | null;
  vista: FacturaFeVista;
  puedeFacturar: boolean;
  puedeConfigurar: boolean;
  puedeAnular: boolean;
  /** Lo cobrado de la factura: si hay pagos, la anulación avisa que deben devolverse. */
  cobrado: number;
  /** Hora del servidor: decide si un envío quedó interrumpido sin depender del reloj del navegador. */
  ahora: Date;
}) {
  const doc = vista.documento;
  const estado = estadoDian(doc, ahora);
  const texto = textoEstadoDian(estado, doc?.ambiente);
  const accion = doc ? reenviarDocumentoAction.bind(null, facturaId, doc.id) : enviarFacturaDianAction.bind(null, facturaId);
  const [state, formAction, pendiente] = useActionState(accion, inicial);
  const puedeEnviar = puedeFacturar && estado !== "ACEPTADO" && estado !== "ANULADO";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Factura electrónica</CardTitle>
        <Badge variant="outline" className={cn("gap-1.5", CLASE_TONO[texto.tono])}>
          {texto.etiqueta}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">{texto.descripcion}</p>
        {!vista.cuenta && !doc ? <p className="text-muted-foreground">Se creó antes de activar la facturación electrónica.</p> : null}

        {doc ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Número</span>
              <span className="font-mono">{`${doc.prefijo}-${doc.numero}`}</span>
            </div>
            {doc.fechaValidacion ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Validada</span>
                <span>{formatoFechaCorta.format(doc.fechaValidacion)}</span>
              </div>
            ) : null}
            {doc.cufe ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Código único (CUFE)</span>
                <span className="font-mono text-xs break-all">{doc.cufe}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {doc && doc.estado === "ACEPTADO" && (doc.pdfRuta || doc.xmlRuta) ? (
          <div className="flex flex-wrap gap-2">
            {doc.pdfRuta ? (
              <a href={doc.pdfRuta} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Descargar PDF
              </a>
            ) : null}
            {doc.xmlRuta ? (
              <a href={doc.xmlRuta} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Descargar XML
              </a>
            ) : null}
          </div>
        ) : null}

        {doc && doc.estado === "ACEPTADO" && (doc.pdfRuta || doc.xmlRuta) && puedeFacturar ? (
          <ReenviarAlCliente facturaId={facturaId} documentoId={doc.id} correoCliente={correoCliente} />
        ) : null}

        {doc && doc.estado !== "ACEPTADO" && doc.mensajes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {doc.mensajes.map((m, i) => (
              <li key={`${m.codigo ?? "m"}-${i}`} className="rounded-lg border border-border p-2">
                <p>{m.explicacion}</p>
                {m.comoCorregir ? <p className="text-muted-foreground">{m.comoCorregir}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {state.error ? <p className="text-destructive">{state.error}</p> : null}
        {state.success && state.mensaje ? <p>{state.mensaje}</p> : null}
        {state.errores.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {state.errores.map((e) => (
              <li key={e.campo}>
                {e.mensaje}{" "}
                {e.campo.startsWith("cliente.") ? (
                  <Link href={`/clientes/${clienteId}#factura-electronica`} className="font-medium text-primary hover:underline">
                    Completar datos del cliente
                  </Link>
                ) : puedeConfigurar ? (
                  <Link href="/configuracion-factura-electronica" className="font-medium text-primary hover:underline">
                    Ir a la configuración
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {puedeEnviar ? (
          <form action={formAction}>
            <Button type="submit" size="sm" disabled={pendiente}>
              {doc ? "Reenviar a la DIAN" : "Enviar a la DIAN"}
            </Button>
          </form>
        ) : null}

        {estado === "ACEPTADO" || estado === "ANULADO" ? (
          <div className="border-t border-border pt-3">
            <NotaCreditoSeccion
              facturaId={facturaId}
              notaCredito={vista.notaCredito}
              puedeAnular={puedeAnular}
              correoCliente={correoCliente}
              puedeFacturar={puedeFacturar}
              cobrado={cobrado}
              ahora={ahora}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
