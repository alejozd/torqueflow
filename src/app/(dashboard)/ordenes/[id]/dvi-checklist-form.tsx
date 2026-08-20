"use client";

import { useActionState } from "react";
import { updateDviChecklistAction, type DviFormState } from "@/app/actions/dvi-actions";
import { DVI_CHECKLIST_ITEMS, DVI_CHECKLIST_STATUSES, type DviChecklist } from "@/lib/dvi/checklist-items";

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
    <form action={formAction}>
      {DVI_CHECKLIST_ITEMS.map((item) => (
        <div key={item.key}>
          <label htmlFor={item.key}>{item.label}</label>
          <select id={item.key} name={item.key} defaultValue={current[item.key] ?? "OK"}>
            {DVI_CHECKLIST_STATUSES.map((estado) => (
              <option key={estado} value={estado}>
                {ESTADO_LABELS[estado]}
              </option>
            ))}
          </select>
        </div>
      ))}

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar checklist"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Checklist guardado</p> : null}
    </form>
  );
}
