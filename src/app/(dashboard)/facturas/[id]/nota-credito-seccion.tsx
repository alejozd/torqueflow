"use client";

import { useActionState, useState } from "react";
import {
  anularConNotaCreditoAction,
  reenviarDocumentoAction,
  type DocumentoFeVista,
  type EnvioFeState,
} from "@/app/actions/factura-electronica-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { formatoFechaCorta } from "@/lib/fecha-bogota";
import { estadoDian, textoEstadoDian, type TonoDian } from "@/lib/factura-electronica/textos";
import { CONCEPTOS_NOTA_CREDITO } from "@/modulos/factura-electronica";
import { cn } from "@/lib/utils";

const inicial: EnvioFeState = { error: null, success: false, mensaje: null, errores: [] };

const CLASE_TONO: Record<TonoDian, string> = {
  exito: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  alerta: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  error: "border-transparent bg-destructive/10 text-destructive",
  neutro: "",
};

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const CONCEPTOS = Object.entries(CONCEPTOS_NOTA_CREDITO).map(([value, label]) => ({ value, label }));

function Resultado({ state }: { state: EnvioFeState }) {
  return (
    <>
      {state.error ? <p className="text-destructive">{state.error}</p> : null}
      {state.success && state.mensaje ? <p>{state.mensaje}</p> : null}
      {state.errores.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {state.errores.map((e) => (
            <li key={e.campo}>{e.mensaje}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function NotaCreditoEmitida({
  facturaId,
  nota,
  puedeFacturar,
  ahora,
}: {
  facturaId: string;
  nota: DocumentoFeVista;
  puedeFacturar: boolean;
  ahora: Date;
}) {
  const estado = estadoDian(nota, ahora);
  const texto = textoEstadoDian(estado, nota.ambiente);
  const [state, formAction, pendiente] = useActionState(reenviarDocumentoAction.bind(null, facturaId, nota.id), inicial);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Nota crédito</h3>
        <Badge variant="outline" className={cn("gap-1.5", CLASE_TONO[texto.tono])}>
          {texto.etiqueta}
        </Badge>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Número</span>
          <span className="font-mono">{`${nota.prefijo}-${nota.numero}`}</span>
        </div>
        {nota.fechaValidacion ? (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Validada</span>
            <span>{formatoFechaCorta.format(nota.fechaValidacion)}</span>
          </div>
        ) : null}
        {nota.cufe ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Código único (CUDE)</span>
            <span className="font-mono text-xs break-all">{nota.cufe}</span>
          </div>
        ) : null}
      </div>

      {nota.estado === "ACEPTADO" && (nota.pdfRuta || nota.xmlRuta) ? (
        <div className="flex flex-wrap gap-2">
          {nota.pdfRuta ? (
            <a href={nota.pdfRuta} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Descargar PDF de la nota crédito
            </a>
          ) : null}
          {nota.xmlRuta ? (
            <a href={nota.xmlRuta} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Descargar XML de la nota crédito
            </a>
          ) : null}
        </div>
      ) : null}

      {nota.estado !== "ACEPTADO" && nota.mensajes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {nota.mensajes.map((m, i) => (
            <li key={`${m.codigo ?? "m"}-${i}`} className="rounded-lg border border-border p-2">
              <p>{m.explicacion}</p>
              {m.comoCorregir ? <p className="text-muted-foreground">{m.comoCorregir}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Resultado state={state} />

      {puedeFacturar && nota.estado !== "ACEPTADO" ? (
        <form action={formAction}>
          <Button type="submit" size="sm" disabled={pendiente}>
            Reenviar a la DIAN
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function FormularioAnular({ facturaId, cobrado }: { facturaId: string; cobrado: number }) {
  const [abierto, setAbierto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [state, formAction, pendiente] = useActionState(anularConNotaCreditoAction.bind(null, facturaId), inicial);

  if (!abierto) {
    return (
      <div className="flex flex-col gap-3">
        <Resultado state={state} />
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setAbierto(true)}>
          Anular con nota crédito
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h3 className="font-medium">Anular con nota crédito</h3>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nc-concepto">Concepto</Label>
        <SelectField id="nc-concepto" name="concepto" defaultValue="2" items={CONCEPTOS} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nc-motivo">Motivo</Label>
        <Textarea id="nc-motivo" name="motivo" required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      {cobrado > 0 ? (
        <p className="text-muted-foreground">
          Esta factura tiene pagos por {formatoMoneda.format(cobrado)}. La nota crédito no los devuelve: devuélvelos al cliente o déjalos
          como anticipo.
        </p>
      ) : null}
      <Resultado state={state} />
      {confirmando ? (
        <ConfirmacionEnLinea
          pregunta="¿Anular esta factura con nota crédito? No se puede deshacer."
          etiquetaConfirmar="Sí, anular"
          onCancelar={() => setConfirmando(false)}
          enviaFormulario
          pendiente={pendiente}
        />
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={motivo.trim() === ""} onClick={() => setConfirmando(true)}>
            Continuar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </form>
  );
}

export function NotaCreditoSeccion({
  facturaId,
  notaCredito,
  puedeAnular,
  puedeFacturar,
  cobrado,
  ahora,
}: {
  facturaId: string;
  notaCredito: DocumentoFeVista | null;
  puedeAnular: boolean;
  puedeFacturar: boolean;
  cobrado: number;
  ahora: Date;
}) {
  if (notaCredito) {
    return <NotaCreditoEmitida facturaId={facturaId} nota={notaCredito} puedeFacturar={puedeFacturar} ahora={ahora} />;
  }
  if (!puedeAnular) return null;
  return <FormularioAnular facturaId={facturaId} cobrado={cobrado} />;
}
