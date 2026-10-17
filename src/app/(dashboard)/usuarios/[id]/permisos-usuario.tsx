"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { guardarPermisosUsuarioAction } from "@/app/actions/usuario-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Button } from "@/components/ui/button";
import { KPI_TONE } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import {
  GRUPOS_PERMISO,
  PERMISOS,
  PERMISOS_SOLO_ADMIN,
  permisosEfectivos,
  type Permiso,
  type Role,
} from "@/lib/auth/permisos";

const VISIBLES = (Object.keys(PERMISOS) as Permiso[]).filter((p) => !PERMISOS_SOLO_ADMIN.includes(p));

interface PermisosUsuarioProps {
  usuarioId: string;
  role: Role;
  agregados: readonly string[];
  quitados: readonly string[];
}

/**
 * Las casillas viven en estado local, así que cuando cambian el rol o las
 * excepciones guardadas (p. ej. el formulario de arriba cambió el rol y vació
 * las excepciones) el editor se monta de nuevo desde las props: si no, guardaría
 * los permisos del rol anterior (Fase 26, I5).
 */
export function PermisosUsuario(props: PermisosUsuarioProps) {
  const clave = `${props.usuarioId}|${props.role}|${props.agregados.join(",")}|${props.quitados.join(",")}`;
  return <EditorPermisos key={clave} {...props} />;
}

function EditorPermisos({ usuarioId, role, agregados, quitados }: PermisosUsuarioProps) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const base = new Set<Permiso>(permisosEfectivos({ role }));
  const [marcados, setMarcados] = useState<Set<Permiso>>(
    () => new Set(permisosEfectivos({ role, agregados, quitados })),
  );
  const [confirmando, setConfirmando] = useState(false);

  function guardar(lista: Permiso[], alGuardar?: () => void) {
    startTransition(async () => {
      const resultado = await guardarPermisosUsuarioAction(usuarioId, lista);
      if (resultado.success) {
        toast.success("Permisos guardados");
        alGuardar?.();
        setConfirmando(false);
        router.refresh();
      } else {
        toast.error(resultado.error ?? "No se pudieron guardar los permisos");
      }
    });
  }

  function alternar(permiso: Permiso) {
    setMarcados((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(permiso)) siguiente.delete(permiso);
      else siguiente.add(permiso);
      return siguiente;
    });
  }

  // Las casillas cambian solo si el guardado sale bien: si falla, la pantalla
  // sigue mostrando lo que de verdad está guardado.
  function volverAlBase() {
    const lista = [...base];
    guardar(lista, () => setMarcados(new Set(lista)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        {GRUPOS_PERMISO.map((grupo) => {
          const deGrupo = VISIBLES.filter((p) => PERMISOS[p].grupo === grupo);
          if (deGrupo.length === 0) return null;
          return (
            <fieldset key={grupo} className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-semibold">{grupo}</legend>
              {deGrupo.map((permiso) => {
                const marcado = marcados.has(permiso);
                const estado = marcado && !base.has(permiso) ? "Agregado" : !marcado && base.has(permiso) ? "Quitado" : null;
                const tono = KPI_TONE[estado === "Agregado" ? "success" : "danger"];
                return (
                  <label key={permiso} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      className="size-4 cursor-pointer"
                      checked={marcado}
                      disabled={pendiente}
                      onChange={() => alternar(permiso)}
                    />
                    <span>{PERMISOS[permiso].etiqueta}</span>
                    {estado ? (
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 text-xs", tono.title)}>
                        <span className={cn("size-1.5 rounded-full bg-current")} />
                        {estado}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={pendiente} onClick={() => guardar([...marcados])}>
          Guardar permisos
        </Button>
        {confirmando ? (
          <ConfirmacionEnLinea
            pregunta="¿Quitar todos los cambios y dejar los permisos del rol?"
            etiquetaConfirmar="Sí, volver al rol base"
            pendiente={pendiente}
            onCancelar={() => setConfirmando(false)}
            onConfirmar={volverAlBase}
          />
        ) : (
          <Button type="button" variant="outline" disabled={pendiente} onClick={() => setConfirmando(true)}>
            Volver al rol base
          </Button>
        )}
      </div>
    </div>
  );
}
