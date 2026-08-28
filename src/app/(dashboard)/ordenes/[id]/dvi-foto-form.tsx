"use client";

import { useActionState } from "react";
import { addDviFotoAction, type DviFormState } from "@/app/actions/dvi-actions";
import type { OrdenWithDetalle } from "@/app/actions/orden-actions";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: DviFormState = { error: null, success: false };

type DviFoto = NonNullable<OrdenWithDetalle["dvi"]>["fotos"][number];

export function DviFotoForm({ ordenId, fotos }: { ordenId: string; fotos: DviFoto[] }) {
  const addFoto = addDviFotoAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addFoto, initialState);

  return (
    <FormGroup label="Fotos de la inspección">
      <form noValidate action={formAction} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="momento">Momento</Label>
            {/*
              Native <select>, not shadcn's Select (Base UI, no DOM <option>s
              while closed) -- getByLabelText in the existing tests needs a
              real <select>/<option> element. Styled by hand to match the
              shadcn select trigger look (see seleccionar-sede-form.tsx).
            */}
            <select
              id="momento"
              name="momento"
              defaultValue="ANTES"
              className="flex h-8 w-28 items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            >
              <option value="ANTES">Antes</option>
              <option value="DESPUES">Después</option>
            </select>
          </div>

          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <Label htmlFor="foto">Foto</Label>
            <Input id="foto" name="foto" type="file" accept="image/jpeg,image/png,image/webp" required />
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? "Subiendo..." : "Subir foto"}
          </Button>
        </div>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {/* Alert hardcodes role="alert"; a status message must keep role="status" natively. */}
        {state.success ? <p role="status">Foto subida</p> : null}
      </form>

      {fotos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Esta orden no tiene fotos de inspección.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map((foto) => (
            <figure key={foto.id} className="overflow-hidden rounded-lg border border-border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated route, next/image's optimizer can't reach it */}
              <img
                src={foto.url}
                alt={`Foto ${foto.momento === "ANTES" ? "antes" : "después"} de la inspección`}
                className="aspect-4/3 w-full object-cover"
              />
              <figcaption className="px-2 py-1 text-[11px] text-muted-foreground">
                {foto.momento === "ANTES" ? "Antes" : "Después"}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </FormGroup>
  );
}
