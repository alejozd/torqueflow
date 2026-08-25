"use client";

import { useActionState } from "react";
import { addDviFotoAction, type DviFormState } from "@/app/actions/dvi-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: DviFormState = { error: null, success: false };

export function DviFotoForm({ ordenId }: { ordenId: string }) {
  const addFoto = addDviFotoAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addFoto, initialState);

  return (
    <form noValidate action={formAction} className="flex flex-col gap-4">
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
          className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
        >
          <option value="ANTES">Antes</option>
          <option value="DESPUES">Después</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="foto">Foto</Label>
        <Input id="foto" name="foto" type="file" accept="image/jpeg,image/png,image/webp" required />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Subiendo..." : "Subir foto"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {/* Alert hardcodes role="alert"; a status message must keep role="status" natively. */}
      {state.success ? <p role="status">Foto subida</p> : null}
    </form>
  );
}
