"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import type { SedeCheckboxOption, UsuarioFormState } from "@/app/actions/usuario-actions";
import { TituloSeccion } from "@/components/titulo-seccion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Role } from "@/lib/auth/permisos";
import { CabeceraUsuario } from "./cabecera-usuario";
import { EditarUsuarioForm, type ControlFormularioUsuario } from "./editar-usuario-form";
import { PermisosUsuario, type ControlPermisosUsuario } from "./permisos-usuario";

/**
 * Qué acciones corre "Guardar cambios" (rediseño, D1). Son dos acciones y no
 * se fusionan. Si cambia el rol se guarda solo el formulario: updateUsuarioAction
 * vacía las excepciones, así que los permisos marcados ya no aplican.
 */
export function decidirGuardado(estado: {
  formConCambios: boolean;
  cambiaRol: boolean;
  permisosConCambios: number;
}): { formulario: boolean; permisos: boolean } {
  return {
    formulario: estado.formConCambios,
    permisos: estado.permisosConCambios > 0 && !estado.cambiaRol,
  };
}

export interface FichaUsuarioUsuario {
  id: string;
  nombre: string;
  email: string;
  role: Role;
  activo: boolean;
  sedeDefectoId: string | null;
  sedeIds: string[];
  permisosAgregados: string[];
  permisosQuitados: string[];
  createdAt: Date;
}

export function FichaUsuario({ usuario, sedes }: { usuario: FichaUsuarioUsuario; sedes: SedeCheckboxOption[] }) {
  const formulario = useRef<ControlFormularioUsuario>(null);
  const permisos = useRef<ControlPermisosUsuario>(null);
  const [estadoForm, setEstadoForm] = useState({ conCambios: false, cambiaRol: false, pendiente: false });
  // Cuántas veces se guardó el formulario: entra en su clave para remontarlo
  // limpio aunque solo haya cambiado la contraseña (que no está en los datos).
  const [guardadosForm, setGuardadosForm] = useState(0);
  // Si hay que guardar formulario y permisos, los permisos esperan a que el
  // formulario salga bien: así un formulario inválido no deja medio guardado.
  const permisosTrasForm = useRef(false);
  const [permisosConCambios, setPermisosConCambios] = useState(0);
  // Descartar = volver a montar ambos editores desde lo guardado.
  const [version, setVersion] = useState(0);
  const [pendiente, startTransition] = useTransition();

  const alCambiarForm = useCallback(
    (estado: { conCambios: boolean; cambiaRol: boolean; pendiente: boolean }) => setEstadoForm(estado),
    [],
  );
  const alGuardarForm = useCallback((resultado: UsuarioFormState) => {
    if (resultado.success) {
      toast.success("Usuario actualizado");
      setGuardadosForm((n) => n + 1);
      if (permisosTrasForm.current) {
        permisosTrasForm.current = false;
        startTransition(async () => {
          await permisos.current?.guardar();
        });
      }
    } else {
      permisosTrasForm.current = false;
      toast.error(resultado.error ?? "No se pudo guardar el usuario");
    }
  }, []);
  const alCambiarPermisos = useCallback((cambios: number) => setPermisosConCambios(cambios), []);

  const esAdmin = usuario.role === "ADMIN";
  const hayCambios = estadoForm.conCambios || (!esAdmin && permisosConCambios > 0);
  // Tras guardar, la página se revalida con los datos nuevos: la clave los
  // remonta limpios (y sin "cambios" pendientes).
  const claveForm = `${version}|${guardadosForm}|${usuario.nombre}|${usuario.email}|${usuario.role}|${usuario.activo}|${usuario.sedeIds.join(",")}|${usuario.sedeDefectoId ?? ""}`;

  function guardar() {
    const plan = decidirGuardado({
      formConCambios: estadoForm.conCambios,
      cambiaRol: estadoForm.cambiaRol,
      permisosConCambios,
    });
    if (plan.formulario) {
      permisosTrasForm.current = plan.permisos;
      formulario.current?.enviar();
    } else if (plan.permisos) {
      startTransition(async () => {
        await permisos.current?.guardar();
      });
    }
  }

  function descartar() {
    setVersion((v) => v + 1);
    setEstadoForm({ conCambios: false, cambiaRol: false, pendiente: false });
    setPermisosConCambios(0);
  }

  const botonGuardar = (
    <Button type="button" disabled={!hayCambios || pendiente || estadoForm.pendiente} onClick={guardar}>
      Guardar cambios
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Editar usuario y permisos</h1>
          <p className="text-sm text-muted-foreground">Datos de acceso, sedes y lo que puede hacer en el sistema.</p>
        </div>
        {botonGuardar}
      </div>

      <CabeceraUsuario nombre={usuario.nombre} email={usuario.email} activo={usuario.activo} createdAt={usuario.createdAt} />

      <Card>
        <CardHeader>
          <CardTitle>Datos del usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <EditarUsuarioForm
            key={claveForm}
            usuario={usuario}
            sedes={sedes}
            controlRef={formulario}
            onEstado={alCambiarForm}
            onGuardado={alGuardarForm}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <TituloSeccion icono={KeyRound} tono="azul">Permisos</TituloSeccion>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {esAdmin ? (
            <p className="text-sm text-muted-foreground">El administrador tiene todos los permisos</p>
          ) : (
            <PermisosUsuario
              key={version}
              usuarioId={usuario.id}
              role={usuario.role}
              agregados={usuario.permisosAgregados}
              quitados={usuario.permisosQuitados}
              controlRef={permisos}
              onCambios={alCambiarPermisos}
            />
          )}
        </CardContent>
      </Card>

      {hayCambios ? (
        <section
          aria-label="Cambios sin guardar"
          className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-card px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)]"
        >
          <span className="size-2 shrink-0 rounded-full bg-orange-500" />
          <div className="flex flex-1 flex-col">
            <span className="text-sm">Tienes cambios sin guardar</span>
            {estadoForm.cambiaRol && permisosConCambios > 0 ? (
              <span className="text-xs text-muted-foreground">
                Al cambiar el rol, los permisos vuelven a los del rol nuevo
              </span>
            ) : null}
          </div>
          <Button type="button" variant="ghost" disabled={pendiente} onClick={descartar}>
            Descartar
          </Button>
          {botonGuardar}
        </section>
      ) : null}
    </div>
  );
}
