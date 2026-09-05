"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AtSign, Plus } from "lucide-react";
import { crearTenantAction, type CrearTenantResult } from "@/app/actions/super-admin-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { normalizeForSearch } from "@/lib/search";

const SLUG_PATTERN = "^[a-z][a-z0-9-]*$";

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
      <Card>
        <CardContent>
          <form ref={formRef} action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="size-1.5 shrink-0 rounded-full bg-amber-600" />
                <span className="text-lg font-semibold text-amber-700">Nuevo cliente / tenant</span>
              </div>
              <span className="text-sm text-muted-foreground">Despliegue de entorno multi-empresa</span>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              Los campos marcados con (*) son obligatorios
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nombre">Nombre del tenant *</Label>
                <Input
                  id="nombre"
                  name="nombre"
                  required
                  placeholder="Ej: Taller Mecánico San Rafael S.A.S."
                  value={nombre}
                  onChange={(e) => handleNombreChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Razón social o nombre visible del taller en la plataforma.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="slug">Slug del tenant (identificador interno) *</Label>
                <Input
                  id="slug"
                  name="slug"
                  required
                  pattern={SLUG_PATTERN}
                  placeholder="taller-san-rafael"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Identificador único del taller en el sistema. Se usa internamente para separar las bases de datos
                  de cada cliente.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="planId">Plan contratado *</Label>
                <SelectField
                  id="planId"
                  name="planId"
                  placeholder="Selecciona un plan..."
                  items={planes.map((plan) => ({ value: plan.id, label: plan.nombre }))}
                />
                <p className="text-xs text-muted-foreground">
                  Determina límites de almacenes, usuarios y órdenes de taller simultáneas.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adminEmail">Email del admin del taller *</Label>
                <div className="relative">
                  <AtSign className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="adminEmail" name="adminEmail" type="email" required className="pl-8" placeholder="admin@mitaller.com" />
                </div>
                <p className="text-xs text-muted-foreground">Recibirá los accesos maestros del taller.</p>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="adminNombre">Nombre del administrador responsable *</Label>
                <Input
                  id="adminNombre"
                  name="adminNombre"
                  required
                  placeholder="Ej: Carlos Ramírez (Gerente de Operaciones)"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetFormulario}>
                Limpiar formulario
              </Button>
              <Button type="submit" disabled={isPending} className="bg-amber-600 text-white hover:bg-amber-700">
                <Plus className="size-4" />
                {isPending ? "Creando..." : "Crear cliente"}
              </Button>
            </div>

            {state.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
          </form>
        </CardContent>
      </Card>

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
