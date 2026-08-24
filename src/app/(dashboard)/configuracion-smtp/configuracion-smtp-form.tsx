"use client";

import { useActionState } from "react";
import {
  guardarConfiguracionSmtpAction,
  probarConfiguracionSmtpAction,
  type ConfiguracionSmtpVista,
  type SmtpFormState,
} from "@/app/actions/smtp-actions";

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

  return (
    <>
      <form noValidate action={formAction}>
        <label htmlFor="host">Servidor SMTP</label>
        <input id="host" name="host" required defaultValue={configuracion?.host ?? ""} />

        <label htmlFor="puerto">Puerto</label>
        <input
          id="puerto"
          name="puerto"
          type="number"
          required
          defaultValue={configuracion ? String(configuracion.puerto) : "587"}
        />

        <label htmlFor="usuario">Usuario</label>
        <input id="usuario" name="usuario" required defaultValue={configuracion?.usuario ?? ""} />

        <label htmlFor="password">Contraseña</label>
        {/* The stored password is never sent to the browser, not even encrypted:
            the field always starts empty and an empty submission means "keep it". */}
        <input id="password" name="password" type="password" required={!configuracion} defaultValue="" />
        {configuracion ? <p>Déjala en blanco para conservar la contraseña guardada.</p> : null}

        <label htmlFor="fromEmail">Correo remitente</label>
        <input id="fromEmail" name="fromEmail" required defaultValue={configuracion?.fromEmail ?? ""} />

        <label htmlFor="fromNombre">Nombre del remitente</label>
        <input id="fromNombre" name="fromNombre" required defaultValue={configuracion?.fromNombre ?? ""} />

        <label htmlFor="activo">Enviar recordatorios</label>
        <input id="activo" name="activo" type="checkbox" defaultChecked={configuracion?.activo ?? true} />

        <button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar configuración"}
        </button>

        {state.error ? <p role="alert">{state.error}</p> : null}
        {state.success ? <p role="status">Configuración guardada</p> : null}
      </form>

      {configuracion ? (
        <form action={pruebaAction}>
          <button type="submit" disabled={pruebaPending}>
            {pruebaPending ? "Enviando..." : "Enviar correo de prueba"}
          </button>
          {pruebaState.error ? <p role="alert">{pruebaState.error}</p> : null}
          {pruebaState.success ? <p role="status">Correo de prueba enviado</p> : null}
        </form>
      ) : null}
    </>
  );
}
