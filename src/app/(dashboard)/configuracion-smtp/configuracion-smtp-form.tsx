"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  guardarConfiguracionSmtpAction,
  probarConfiguracionSmtpAction,
  type ConfiguracionSmtpVista,
  type SmtpFormState,
} from "@/app/actions/smtp-actions";
import { smtpConfigInputSchema } from "@/lib/validation/smtp";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SmtpFormState = { error: null, success: false };

export function ConfiguracionSmtpForm({
  configuracion,
}: {
  configuracion: ConfiguracionSmtpVista | null;
}) {
  const [state, formAction, isPending] = useActionState(guardarConfiguracionSmtpAction, initialState);
  const [pruebaState, pruebaAction, pruebaPending] = useActionState(
    probarConfiguracionSmtpAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  // register("activo") on a lone checkbox (no shared `name`/`value` group,
  // unlike asignar-sedes' sedeIds) reports a boolean to RHF/zod, not the
  // "on"/"" string smtpConfigInputSchema.activo expects from raw FormData --
  // overridden here for typing only; the real submission still reads the
  // checkbox's native checked state via `new FormData(formRef.current!)`.
  // guardarConfiguracionSmtpAction additionally refuses a blank password when
  // there is no `configuracion` yet -- mirrored client-side via superRefine
  // instead of `.extend()`, so the field stays optional in the TYPE (stable
  // across the `configuracion`/`!configuracion` branches) and only the
  // create-only rule is conditional.
  const smtpFormSchema = smtpConfigInputSchema.extend({ activo: z.boolean().optional() }).superRefine((data, ctx) => {
    if (!configuracion && !data.password) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "La contraseña es obligatoria" });
    }
  });
  type SmtpFormInput = z.input<typeof smtpFormSchema>;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SmtpFormInput>({
    resolver: zodResolver(smtpFormSchema),
    defaultValues: {
      host: configuracion?.host ?? "",
      puerto: configuracion ? String(configuracion.puerto) : "587",
      usuario: configuracion?.usuario ?? "",
      password: "",
      fromEmail: configuracion?.fromEmail ?? "",
      fromNombre: configuracion?.fromNombre ?? "",
      activo: configuracion?.activo ?? true,
    },
  });

  return (
    <>
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
        className="flex flex-col gap-6"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="host">Servidor SMTP</Label>
            <Input
              id="host"
              required
              aria-invalid={errors.host ? true : undefined}
              aria-describedby={errors.host ? "host-error" : undefined}
              {...register("host")}
            />
            {errors.host ? <p id="host-error">{errors.host.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="puerto">Puerto</Label>
            <Input
              id="puerto"
              type="number"
              required
              aria-invalid={errors.puerto ? true : undefined}
              aria-describedby={errors.puerto ? "puerto-error" : undefined}
              {...register("puerto")}
            />
            {errors.puerto ? <p id="puerto-error">{errors.puerto.message}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="usuario">Usuario</Label>
            <Input
              id="usuario"
              required
              aria-invalid={errors.usuario ? true : undefined}
              aria-describedby={errors.usuario ? "usuario-error" : undefined}
              {...register("usuario")}
            />
            {errors.usuario ? <p id="usuario-error">{errors.usuario.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            {/* The stored password is never sent to the browser, not even encrypted:
                the field always starts empty and an empty submission means "keep it". */}
            <Input
              id="password"
              type="password"
              required={!configuracion}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            {configuracion ? <p>Déjala en blanco para conservar la contraseña guardada.</p> : null}
            {errors.password ? <p id="password-error">{errors.password.message}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fromEmail">Correo remitente</Label>
            <Input
              id="fromEmail"
              required
              aria-invalid={errors.fromEmail ? true : undefined}
              aria-describedby={errors.fromEmail ? "fromEmail-error" : undefined}
              {...register("fromEmail")}
            />
            {errors.fromEmail ? <p id="fromEmail-error">{errors.fromEmail.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fromNombre">Nombre del remitente</Label>
            <Input
              id="fromNombre"
              required
              aria-invalid={errors.fromNombre ? true : undefined}
              aria-describedby={errors.fromNombre ? "fromNombre-error" : undefined}
              {...register("fromNombre")}
            />
            {errors.fromNombre ? <p id="fromNombre-error">{errors.fromNombre.message}</p> : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/*
            Native checkbox input -- no shadcn Checkbox component exists in
            this project yet, and this form's tests rely on a real
            <input type="checkbox"> for userEvent.click()/.checked.
          */}
          <input id="activo" type="checkbox" {...register("activo")} />
          <Label htmlFor="activo">Enviar recordatorios</Label>
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar configuración"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? <p role="status">Configuración guardada</p> : null}
      </form>

      {configuracion ? (
        <form action={pruebaAction} className="flex flex-col gap-1.5">
          <Button type="submit" variant="outline" disabled={pruebaPending}>
            {pruebaPending ? "Enviando..." : "Enviar correo de prueba"}
          </Button>
          {pruebaState.error ? (
            <Alert variant="destructive">
              <AlertDescription>{pruebaState.error}</AlertDescription>
            </Alert>
          ) : null}
          {pruebaState.success ? <p role="status">Correo de prueba enviado</p> : null}
        </form>
      ) : null}
    </>
  );
}
