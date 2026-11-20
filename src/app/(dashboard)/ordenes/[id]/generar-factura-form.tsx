"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { crearFacturaAction, type FacturaFormState } from "@/app/actions/factura-actions";
import { facturarOrdenInputSchema } from "@/lib/validation/factura";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectorIva } from "@/components/selector-iva";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoMiles = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** "20088" o "20.088" → "20.088"; vacío si no hay dígitos. */
function formatearPesos(texto: string): string {
  const digitos = texto.replace(/\D/g, "");
  return digitos === "" ? "" : formatoMiles.format(Number(digitos));
}

/** Una línea de la orden tal como se revisa antes de facturar. */
export interface LineaFactura {
  conceptoId: string;
  descripcion: string;
  /** Importe con IVA incluido. */
  importe: number;
  ivaPct: number;
}

const initialState: FacturaFormState = { error: null, success: false, facturaId: null };

// crearFacturaAction reads formData.get("descuento") || undefined before
// parsing -- an untouched number input submits "", which .optional() alone
// does not treat as absent.
const facturaFormSchema = facturarOrdenInputSchema.extend({
  descuento: z.preprocess((v) => (v === "" ? undefined : v), facturarOrdenInputSchema.shape.descuento),
});
type FacturaFormInput = z.input<typeof facturaFormSchema>;

/**
 * Generar la factura de la orden: descuento y la tarifa de IVA de cada línea
 * (la del catálogo por defecto, cambiable aquí). Los precios ya traen el IVA;
 * la factura solo lo separa.
 */
export function GenerarFacturaForm({
  ordenId,
  lineas = [],
  descuentoInicial = 0,
  origenDescuento,
}: {
  ordenId: string;
  lineas?: LineaFactura[];
  /** El descuento de la cotización, si la orden viene de una (editable). */
  descuentoInicial?: number;
  /** De dónde viene el descuento inicial, p. ej. "la cotización #46". */
  origenDescuento?: string;
}) {
  const [tarifas, setTarifas] = useState<Record<string, number>>(() =>
    Object.fromEntries(lineas.map((linea) => [linea.conceptoId, linea.ivaPct])),
  );
  const router = useRouter();
  const [state, setState] = useState<FacturaFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmando, setConfirmando] = useState(false);
  const {
    register,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<FacturaFormInput>({
    resolver: zodResolver(facturaFormSchema),
    defaultValues: { descuento: descuentoInicial > 0 ? String(Math.round(descuentoInicial)) : "" },
  });
  // El campo visible muestra los pesos con puntos de miles; el oculto lleva el número.
  const [textoDescuento, setTextoDescuento] = useState(() =>
    descuentoInicial > 0 ? formatoMiles.format(Math.round(descuentoInicial)) : "",
  );

  function onValid() {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      const result = await crearFacturaAction(ordenId, initialState, formData);
      // Navigate from inside this same transition, not a useEffect: crearFacturaAction's
      // revalidatePath(`/ordenes/${ordenId}`) makes this form's own parent swap it out for
      // a "Ver factura" link once orden.factura is populated, which can unmount this
      // component before a state-driven effect gets a chance to run router.push.
      if (result.success && result.facturaId) {
        router.push(`/facturas/${result.facturaId}`);
      } else {
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onChange={() => setConfirmando(false)} onSubmit={(evento) => handleSubmit(onValid)(evento)} className="flex flex-col gap-6">
      <p className="text-sm font-semibold">Generar factura</p>
      {lineas.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">IVA de cada línea</p>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border text-sm">
            {lineas.map((linea) => (
              <li key={linea.conceptoId} className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">{linea.descripcion}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatoMoneda.format(linea.importe)}</span>
                <SelectorIva
                  compacto
                  size="sm"
                  etiqueta={`IVA de ${linea.descripcion}`}
                  value={tarifas[linea.conceptoId]}
                  onChange={(ivaPct) => {
                    setConfirmando(false);
                    setTarifas((actual) => ({ ...actual, [linea.conceptoId]: ivaPct }));
                  }}
                  className="w-[84px] shrink-0 px-1.5 font-mono text-xs"
                />
              </li>
            ))}
          </ul>
          <input
            type="hidden"
            name="tarifas"
            value={JSON.stringify(lineas.map((linea) => ({ conceptoId: linea.conceptoId, ivaPct: tarifas[linea.conceptoId] })))}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="descuento">Descuento en la factura ($)</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            id="descuento"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            className="pl-6 font-mono"
            value={textoDescuento}
            onChange={(evento) => {
              const texto = formatearPesos(evento.target.value);
              setTextoDescuento(texto);
              setValue("descuento", texto.replace(/\D/g, ""), { shouldValidate: Boolean(errors.descuento) });
            }}
            aria-invalid={errors.descuento ? true : undefined}
            aria-describedby={errors.descuento ? "descuento-error" : origenDescuento ? "descuento-ayuda" : undefined}
          />
        </div>
        <input type="hidden" {...register("descuento")} />
        {origenDescuento && !errors.descuento ? (
          <p id="descuento-ayuda" className="text-xs text-muted-foreground">
            Viene de {origenDescuento}. Cámbialo si vas a facturar con otro descuento.
          </p>
        ) : null}
        {errors.descuento ? <p id="descuento-error" className="text-xs text-destructive">{errors.descuento.message}</p> : null}
      </div>

      {confirmando ? (
        <ConfirmacionEnLinea
          pregunta="¿Generar la factura? Se descuenta el stock de los repuestos y la orden ya no se podrá editar."
          etiquetaConfirmar="Sí, facturar"
          destructiva={false}
          enviaFormulario
          pendiente={isPending}
          onCancelar={() => setConfirmando(false)}
        />
      ) : (
        <Button type="submit" disabled={isPending} className="self-end">
          {isPending ? "Generando..." : "Generar factura"}
        </Button>
      )}

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
