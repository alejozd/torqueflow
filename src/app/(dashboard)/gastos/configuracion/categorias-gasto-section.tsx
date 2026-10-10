"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  crearCategoriaGastoAction,
  renombrarCategoriaGastoAction,
  toggleCategoriaGastoActivaAction,
  type CategoriaGastoFormState,
  type CategoriaGastoVista,
} from "@/app/actions/categoria-gasto-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CategoriaGastoFormState = { error: null, success: false };

function FilaCategoria({ categoria }: { categoria: CategoriaGastoVista }) {
  const [editando, setEditando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [state, formAction, renombrando] = useActionState(
    async (prev: CategoriaGastoFormState, formData: FormData) => {
      const result = await renombrarCategoriaGastoAction(categoria.id, prev, formData);
      if (result.success) {
        toast.success("Categoría renombrada");
        setEditando(false);
      }
      return result;
    },
    initialState,
  );

  function toggle() {
    startTransition(async () => {
      try {
        const result = await toggleCategoriaGastoActivaAction(categoria.id);
        if (result.error) toast.error(result.error);
      } catch {
        toast.error("No se pudo actualizar la categoría");
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      {editando ? (
        <form action={formAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Input
            name="nombre"
            defaultValue={categoria.nombre}
            aria-label={`Nombre de ${categoria.nombre}`}
            className="min-w-0 flex-1"
            autoFocus
          />
          <Button type="submit" size="sm" disabled={renombrando}>
            Guardar
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
          {state.error ? (
            <p className="w-full text-xs text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
        </form>
      ) : (
        <>
          <span className={categoria.activo ? "min-w-0 flex-1 truncate" : "min-w-0 flex-1 truncate text-muted-foreground"}>
            {categoria.nombre}
          </span>
          {!categoria.activo ? <Badge variant="secondary">Inactiva</Badge> : null}
          <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
            Renombrar
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={toggle}>
            {categoria.activo ? "Desactivar" : "Activar"}
          </Button>
        </>
      )}
    </li>
  );
}

export function CategoriasGastoSection({ categorias }: { categorias: CategoriaGastoVista[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    async (prev: CategoriaGastoFormState, formData: FormData) => crearCategoriaGastoAction(prev, formData),
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Categoría creada");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {categorias.map((c) => (
          <FilaCategoria key={c.id} categoria={c} />
        ))}
      </ul>
      <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
        <Label htmlFor="nueva-categoria-gasto">Nueva categoría</Label>
        <div className="flex gap-2">
          <Input id="nueva-categoria-gasto" name="nombre" className="min-w-0 flex-1" />
          <Button type="submit" disabled={isPending}>
            Agregar
          </Button>
        </div>
        {state.error ? (
          <p className="text-xs text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
