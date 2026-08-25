"use client";

import { useActionState } from "react";
import { updateDviChecklistAction, type DviFormState } from "@/app/actions/dvi-actions";
import { DVI_CHECKLIST_ITEMS, DVI_CHECKLIST_STATUSES, type DviChecklist } from "@/lib/dvi/checklist-items";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initialState: DviFormState = { error: null, success: false };

const ESTADO_LABELS: Record<(typeof DVI_CHECKLIST_STATUSES)[number], string> = {
  OK: "OK",
  ATENCION: "Atención",
  CRITICO: "Crítico",
  NO_APLICA: "No aplica",
};

export function DviChecklistForm({ ordenId, checklist }: { ordenId: string; checklist: DviChecklist | null }) {
  const current = checklist ?? {};
  const saveChecklist = updateDviChecklistAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(saveChecklist, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {DVI_CHECKLIST_ITEMS.map((item) => (
        <div key={item.key} className="flex flex-col gap-1.5">
          <Label htmlFor={item.key}>{item.label}</Label>
          {/*
            Native <select>, not shadcn's Select (Base UI, no DOM <option>s
            while closed) -- getByLabelText/value in the existing tests needs
            a real <select>/<option> element. Styled by hand to match the
            shadcn select trigger look (see seleccionar-sede-form.tsx).
          */}
          <select
            id={item.key}
            name={item.key}
            defaultValue={current[item.key] ?? "OK"}
            className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
          >
            {DVI_CHECKLIST_STATUSES.map((estado) => (
              <option key={estado} value={estado}>
                {ESTADO_LABELS[estado]}
              </option>
            ))}
          </select>
        </div>
      ))}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar checklist"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {/* Alert hardcodes role="alert"; a status message must keep role="status" natively. */}
      {state.success ? <p role="status">Checklist guardado</p> : null}
    </form>
  );
}
