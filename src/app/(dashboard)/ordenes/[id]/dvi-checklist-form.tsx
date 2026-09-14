"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Eye, EyeOff, Plus } from "lucide-react";
import { updateDviChecklistAction, type DviFormState } from "@/app/actions/dvi-actions";
import { toggleDviChecklistItemActivoAction } from "@/app/actions/dvi-checklist-item-actions";
import { DVI_CHECKLIST_STATUSES, type DviChecklist, type DviChecklistStatus } from "@/lib/dvi/checklist-items";
import type { DviChecklistItem } from "@/generated/prisma-tenant";
import { NuevoDviChecklistItemDialog } from "./nuevo-dvi-checklist-item-dialog";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

export function DviChecklistForm({
  ordenId,
  checklist,
  items: initialItems,
  esAdmin = false,
}: {
  ordenId: string;
  checklist: DviChecklist | null;
  items: DviChecklistItem[];
  esAdmin?: boolean;
}) {
  const current = checklist ?? {};
  const [items, setItems] = useState(initialItems);
  const [nuevoItemOpen, setNuevoItemOpen] = useState(false);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const router = useRouter();
  const [isTogglePending, startToggleTransition] = useTransition();
  const saveChecklist = updateDviChecklistAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(saveChecklist, initialState);

  const itemsActivos = items.filter((item) => item.activo);
  // Every deactivated item -- archived with a saved value or never given
  // one -- is hidden by default and only reachable by an ADMIN through the
  // "Ver ítems desactivados" toggle below, where it can also be reactivated.
  const itemsInactivos = items.filter((item) => !item.activo);

  function toggleActivo(itemId: string) {
    startToggleTransition(async () => {
      try {
        await toggleDviChecklistItemActivoAction(itemId);
        setItems((prev) =>
          prev.map((item) => (item.id === itemId ? { ...item, activo: !item.activo } : item)),
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al actualizar el ítem");
      }
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormGroup label="Checklist">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {itemsActivos.map((item) => {
            const valor = current[item.key] ?? "OK";
            return (
              <div
                key={item.key}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", ESTADO_DOT_COLOR[valor])} />
                <Label htmlFor={item.key} className="min-w-0 flex-1 text-xs leading-tight font-normal">
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
                {esAdmin ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    disabled={isTogglePending}
                    onClick={() => toggleActivo(item.id)}
                    aria-label={`Desactivar ${item.label}`}
                    title="Desactivar este ítem del checklist"
                  >
                    <EyeOff className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>

        {esAdmin ? (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setNuevoItemOpen(true)}>
            <Plus className="size-3.5" />
            Agregar ítem
          </Button>
        ) : null}

        {esAdmin && itemsInactivos.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit text-muted-foreground"
              onClick={() => setMostrarInactivos((prev) => !prev)}
              aria-expanded={mostrarInactivos}
            >
              {mostrarInactivos ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              Ver ítems desactivados ({itemsInactivos.length})
            </Button>

            {mostrarInactivos ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {itemsInactivos.map((item) => {
                  const valor = current[item.key] as DviChecklistStatus | undefined;
                  return (
                    <div
                      key={item.key}
                      className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-1.5"
                    >
                      {valor ? <span className={cn("size-1.5 shrink-0 rounded-full", ESTADO_DOT_COLOR[valor])} /> : null}
                      <span className="min-w-0 flex-1 text-xs leading-tight text-muted-foreground">{item.label}</span>
                      {valor ? (
                        <>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            Archivado
                          </Badge>
                          <span className="w-[70px] shrink-0 text-right text-xs text-muted-foreground">
                            {ESTADO_LABELS[valor]}
                          </span>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        disabled={isTogglePending}
                        onClick={() => toggleActivo(item.id)}
                        aria-label={`Reactivar ${item.label}`}
                        title="Reactivar este ítem del checklist"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
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

      {esAdmin ? (
        <NuevoDviChecklistItemDialog
          open={nuevoItemOpen}
          onOpenChange={setNuevoItemOpen}
          onCreated={(item) => {
            setItems((prev) => [...prev, item]);
            setNuevoItemOpen(false);
          }}
        />
      ) : null}
    </form>
  );
}
