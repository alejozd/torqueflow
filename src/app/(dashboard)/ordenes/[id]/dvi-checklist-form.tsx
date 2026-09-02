"use client";

import { useActionState } from "react";
import { updateDviChecklistAction, type DviFormState } from "@/app/actions/dvi-actions";
import { DVI_CHECKLIST_ITEMS, DVI_CHECKLIST_STATUSES, type DviChecklist, type DviChecklistStatus } from "@/lib/dvi/checklist-items";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";

const initialState: DviFormState = { error: null, success: false };

const ESTADO_LABELS: Record<DviChecklistStatus, string> = {
  OK: "OK",
  ATENCION: "Atención",
  CRITICO: "Crítico",
  NO_APLICA: "No aplica",
};

// Same tones as the estado badges elsewhere in this page (green/amber/red),
// applied to a dot instead of a badge background.
const ESTADO_DOT_COLOR: Record<DviChecklistStatus, string> = {
  OK: "bg-[oklch(0.4_0.1_150)]",
  ATENCION: "bg-[oklch(0.55_0.15_60)]",
  CRITICO: "bg-[oklch(0.5_0.2_27)]",
  NO_APLICA: "bg-muted-foreground",
};

export function DviChecklistForm({ ordenId, checklist }: { ordenId: string; checklist: DviChecklist | null }) {
  const current = checklist ?? {};
  const saveChecklist = updateDviChecklistAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(saveChecklist, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormGroup label="Checklist de 8 puntos">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DVI_CHECKLIST_ITEMS.map((item) => {
            const valor = current[item.key] ?? "OK";
            return (
              <div
                key={item.key}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", ESTADO_DOT_COLOR[valor])} />
                <Label htmlFor={item.key} className="flex-1 text-xs leading-tight font-normal">
                  {item.label}
                </Label>
                <SelectField
                  id={item.key}
                  name={item.key}
                  defaultValue={valor}
                  size="sm"
                  className="h-7 w-[90px] shrink-0 px-1.5 text-xs"
                  items={DVI_CHECKLIST_STATUSES.map((estado) => ({
                    value: estado,
                    label: ESTADO_LABELS[estado],
                  }))}
                />
              </div>
            );
          })}
        </div>
      </FormGroup>

      <Button type="submit" disabled={isPending} className="self-end">
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
