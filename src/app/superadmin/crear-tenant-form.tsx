"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { crearTenantAction, type CrearTenantResult } from "@/app/actions/super-admin-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormGroup } from "@/components/form-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { normalizeForSearch } from "@/lib/search";

const initialState: CrearTenantResult = { error: null, credenciales: null };

function slugify(texto: string): string {
  return normalizeForSearch(texto)
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CrearTenantForm({ planes }: { planes: { id: string; nombre: string }[] }) {
  const [state, formAction, isPending] = useActionState(crearTenantAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const slugTouchedRef = useRef(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (state.credenciales) {
      setDialogOpen(true);
    }
  }, [state.credenciales]);

  function handleNombreChange(value: string) {
    setNombre(value);
    if (!slugTouchedRef.current) {
      setSlug(slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    slugTouchedRef.current = true;
    setSlug(value);
  }

  function resetFormulario() {
    formRef.current?.reset();
    setNombre("");
    setSlug("");
    slugTouchedRef.current = false;
  }

  return (
    <>
      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        <FormGroup label="Nuevo cliente">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nombre">Nombre del tenant</Label>
              <Input
                id="nombre"
                name="nombre"
                required
                value={nombre}
                onChange={(e) => handleNombreChange(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" required value={slug} onChange={(e) => handleSlugChange(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="planId">Plan</Label>
              <SelectField
                id="planId"
                name="planId"
                items={planes.map((plan) => ({ value: plan.id, label: plan.nombre }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adminEmail">Email del admin</Label>
              <Input id="adminEmail" name="adminEmail" type="email" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adminNombre">Nombre del admin</Label>
              <Input id="adminNombre" name="adminNombre" required />
            </div>
          </div>
        </FormGroup>

        <Button type="submit" disabled={isPending} className="self-end">
          {isPending ? "Creando..." : "Crear cliente"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
      </form>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetFormulario();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>✅ Cliente creado exitosamente</DialogTitle>
            <DialogDescription>Credenciales del admin</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="credencial-email">Email</Label>
              <Input id="credencial-email" readOnly value={state.credenciales?.email ?? ""} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="credencial-password">Password</Label>
              <Input id="credencial-password" readOnly value={state.credenciales?.password ?? ""} />
            </div>
            <p className="text-sm text-destructive">⚠️ Copia esta contraseña ahora. No se mostrará de nuevo.</p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(state.credenciales?.password ?? "")}
            >
              Copiar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDialogOpen(false);
                resetFormulario();
              }}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
