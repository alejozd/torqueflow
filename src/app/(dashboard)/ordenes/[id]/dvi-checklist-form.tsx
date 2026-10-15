"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Eye, EyeOff, Plus } from "lucide-react";
import { updateDviChecklistAction, type DviFormState } from "@/app/actions/dvi-actions";
import { EstadoGuardado } from "@/components/estado-guardado";
import { useAutoguardado } from "@/hooks/use-autoguardado";
import { toggleDviChecklistItemActivoAction } from "@/app/actions/dvi-checklist-item-actions";
import { DVI_CHECKLIST_STATUSES, type DviChecklist, type DviChecklistStatus } from "@/lib/dvi/checklist-items";
import type { DviChecklistItem } from "@/generated/prisma-tenant";
import { NuevoDviChecklistItemDialog } from "./nuevo-dvi-checklist-item-dialog";
import { FormGroup } from "@/components/form-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// El botón elegido de cada ítem, con el mismo tono que su punto.
const SEGMENTO_ELEGIDO: Record<DviChecklistStatus, string> = {
  OK: "bg-[oklch(0.4_0.1_150/0.14)] font-semibold text-[oklch(0.4_0.1_150)]",
  ATENCION: "bg-[oklch(0.55_0.15_60/0.16)] font-semibold text-[oklch(0.55_0.15_60)]",
  CRITICO: "bg-[oklch(0.5_0.2_27/0.12)] font-semibold text-[oklch(0.5_0.2_27)]",
  NO_APLICA: "bg-muted font-semibold text-muted-foreground",
};

/**
 * Checklist DVI que se guarda solo: cada ítem se marca con un toque y se envía
 * solo esa clave (la acción la mezcla con lo guardado). Lo que nadie ha revisado
 * queda sin marcar en vez de salir «OK» por defecto.
 */
export function DviChecklistForm({
  ordenId,
  checklist,
  items: initialItems,
  esAdmin = false,
  soloLectura = false,
}: {
  ordenId: string;
  checklist: DviChecklist | null;
  items: DviChecklistItem[];
  esAdmin?: boolean;
  /** Invoiced/closed orden: show the saved values, offer no edit controls (the actions would refuse them). */
  soloLectura?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [nuevoItemOpen, setNuevoItemOpen] = useState(false);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const router = useRouter();
  const [isTogglePending, startToggleTransition] = useTransition();
  const guardarChecklist = updateDviChecklistAction.bind(null, ordenId);
  const { guardar, fase, error } = useAutoguardado(guardarChecklist, initialState);
  const [valores, setValores] = useState<DviChecklist>(checklist ?? {});

  function marcar(cambios: DviChecklist) {
    setValores((previos) => ({ ...previos, ...cambios }));
    const formData = new FormData();
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) formData.set(clave, valor);
    }
    guardar(formData);
  }

  const itemsActivos = items.filter((item) => item.activo);
  // Every deactivated item -- archived with a saved value or never given
  // one -- is hidden by default and only reachable by an ADMIN through the
  // "Ver ítems desactivados" toggle below, where it can also be reactivated.
  const itemsInactivos = items.filter((item) => !item.activo);
  const revisados = itemsActivos.filter((item) => valores[item.key]).length;
  const faltantes = itemsActivos.filter((item) => !valores[item.key]);

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
    <div className="flex flex-col gap-4">
      <FormGroup label="Checklist">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            {revisados} de {itemsActivos.length} revisados
          </span>
          {!soloLectura && faltantes.length > 0 && revisados > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => marcar(Object.fromEntries(faltantes.map((item) => [item.key, "OK"])))}
            >
              Marcar el resto OK
            </Button>
          ) : null}
          <EstadoGuardado fase={fase} error={error} />
        </div>
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          {itemsActivos.map((item) => {
            const valor = valores[item.key] as DviChecklistStatus | undefined;
            return (
              <div
                key={item.key}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
              >
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", valor ? ESTADO_DOT_COLOR[valor] : "bg-border")}
                />
                <span
                  id={`dvi-${item.key}`}
                  title={item.label}
                  className="min-w-0 flex-1 truncate text-xs leading-tight"
                >
                  {item.label}
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby={`dvi-${item.key}`}
                  className="inline-flex shrink-0 overflow-hidden rounded-md border border-border"
                >
                  {DVI_CHECKLIST_STATUSES.map((estado) => (
                    <button
                      key={estado}
                      type="button"
                      role="radio"
                      aria-checked={valor === estado}
                      disabled={soloLectura}
                      onClick={() => marcar({ [item.key]: estado })}
                      className={cn(
                        "border-r border-border px-2 py-0.5 text-[11px] last:border-r-0 disabled:cursor-default",
                        valor === estado ? SEGMENTO_ELEGIDO[estado] : "bg-card hover:bg-muted disabled:hover:bg-card",
                      )}
                    >
                      {ESTADO_LABELS[estado]}
                    </button>
                  ))}
                </div>
                {esAdmin && !soloLectura ? (
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

        {esAdmin && !soloLectura ? (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setNuevoItemOpen(true)}>
            <Plus className="size-3.5" />
            Agregar ítem
          </Button>
        ) : null}

        {esAdmin && !soloLectura && itemsInactivos.length > 0 ? (
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {itemsInactivos.map((item) => {
                  const valor = valores[item.key] as DviChecklistStatus | undefined;
                  return (
                    <div
                      key={item.key}
                      className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-1.5"
                    >
                      {valor ? <span className={cn("size-1.5 shrink-0 rounded-full", ESTADO_DOT_COLOR[valor])} /> : null}
                      <span
                        title={item.label}
                        className="min-w-0 flex-1 truncate text-xs leading-tight text-muted-foreground"
                      >
                        {item.label}
                      </span>
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

      {soloLectura ? (
        <p className="text-xs text-muted-foreground">La orden ya está facturada o cerrada: el checklist queda solo de consulta.</p>
      ) : null}

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
    </div>
  );
}
