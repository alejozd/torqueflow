"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { crearFacturaAction, type FacturaFormState } from "@/app/actions/factura-actions";
import { facturarOrdenInputSchema } from "@/lib/validation/factura";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FacturaFormState = { error: null, success: false, facturaId: null };

// crearFacturaAction reads formData.get("descuento") || undefined before
// parsing -- an untouched number input submits "", which .optional() alone
// does not treat as absent.
const facturaFormSchema = facturarOrdenInputSchema.extend({
  descuento: z.preprocess((v) => (v === "" ? undefined : v), facturarOrdenInputSchema.shape.descuento),
});
type FacturaFormInput = z.input<typeof facturaFormSchema>;

export function GenerarFacturaForm({ ordenId }: { ordenId: string }) {
  const router = useRouter();
  const [state, setState] = useState<FacturaFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FacturaFormInput>({
    resolver: zodResolver(facturaFormSchema),
    defaultValues: { descuento: 0 },
  });

  function onValid() {
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
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="descuento">Descuento</Label>
        <Input
          id="descuento"
          type="number"
          min="0"
          step="0.01"
          aria-invalid={errors.descuento ? true : undefined}
          aria-describedby={errors.descuento ? "descuento-error" : undefined}
          {...register("descuento")}
        />
        {errors.descuento ? <p id="descuento-error">{errors.descuento.message}</p> : null}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Generando..." : "Generar factura"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
