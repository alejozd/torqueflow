"use client";

import { startTransition, useActionState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  asignarMecanicoAction,
  type AsignarMecanicoFormState,
  type TecnicoOption,
} from "@/app/actions/orden-actions";
import { EstadoGuardado } from "@/components/estado-guardado";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const initialState: AsignarMecanicoFormState = { error: null, success: false };

/**
 * El mecánico en la cabecera: se lee de un vistazo y se cambia por excepción
 * desde «Cambiar», que guarda al elegir (como la prioridad). Quién puede cambiarlo
 * lo decide la página con la misma regla de `asignarMecanicoAction`.
 */
export function MecanicoMenu({
  ordenId,
  mecanico,
  tecnicos,
  editable,
}: {
  ordenId: string;
  mecanico: { id: string; nombre: string } | null;
  tecnicos: TecnicoOption[];
  editable: boolean;
}) {
  const asignar = asignarMecanicoAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(asignar, initialState);

  function elegir(mecanicoId: string) {
    const formData = new FormData();
    formData.set("mecanicoId", mecanicoId);
    startTransition(() => formAction(formData));
  }

  const opciones = mecanico ? [...tecnicos, { id: "", nombre: "Sin asignar" }] : tecnicos;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-medium">{mecanico?.nombre ?? "Sin asignar"}</span>
      {editable ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="xs" disabled={isPending} />}>
            {mecanico ? "Cambiar" : "Asignar"}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {/* Base UI: el título va dentro de un grupo y los ítems reaccionan a onClick. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Asignar a…</DropdownMenuLabel>
              {opciones.map((opcion) => {
                const actual = opcion.id === (mecanico?.id ?? "");
                return (
                  <DropdownMenuItem
                    key={opcion.id || "sin-asignar"}
                    disabled={actual}
                    onClick={() => elegir(opcion.id)}
                  >
                    {opcion.nombre}
                    {actual ? <Check className="ml-auto size-3.5" /> : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <EstadoGuardado
        fase={isPending ? "guardando" : state.error ? "error" : state.success ? "guardado" : "inactivo"}
        error={state.error}
      />
    </span>
  );
}
