"use client";

import { useState, useTransition } from "react";
import {
  CalendarDays,
  FileText,
  Package,
  Search,
  Settings,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { guardarPermisosUsuarioAction } from "@/app/actions/usuario-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KPI_TONE, type KpiTone } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import {
  GRUPOS_PERMISO,
  PERMISOS,
  PERMISOS_SOLO_ADMIN,
  permisosEfectivos,
  type GrupoPermiso,
  type Permiso,
  type Role,
} from "@/lib/auth/permisos";

const VISIBLES = (Object.keys(PERMISOS) as Permiso[]).filter((p) => !PERMISOS_SOLO_ADMIN.includes(p));

const ICONO_GRUPO: Record<GrupoPermiso, { icono: LucideIcon; tono: KpiTone }> = {
  "Clientes y vehículos": { icono: Users, tono: "info" },
  Citas: { icono: CalendarDays, tono: "warning" },
  Cotizaciones: { icono: FileText, tono: "success" },
  Órdenes: { icono: Wrench, tono: "info" },
  Dinero: { icono: Wallet, tono: "success" },
  Inventario: { icono: Package, tono: "warning" },
  Administración: { icono: Settings, tono: "info" },
};

const NOMBRE_ROL: Record<Role, string> = {
  ADMIN: "Administrador",
  JEFE_TALLER: "Jefe de taller",
  TECNICO: "Técnico",
  RECEPCION: "Recepción",
};

/** Minúsculas y sin tildes, para que "vehiculo" encuentre "vehículo". */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const esDeVer = (permiso: Permiso) => permiso.endsWith(".ver") || permiso.endsWith(".verTodas");

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
  const [busqueda, setBusqueda] = useState("");

  const filtro = normalizar(busqueda.trim());
  const visibles = filtro ? VISIBLES.filter((p) => normalizar(PERMISOS[p].etiqueta).includes(filtro)) : VISIBLES;
  const cambios = VISIBLES.filter((p) => marcados.has(p) !== base.has(p)).length;

  // Las acciones masivas solo tocan lo que deja ver el buscador (y nunca un ★:
  // no están en VISIBLES).
  function aplicarAVisibles(debeMarcar: (permiso: Permiso) => boolean) {
    setMarcados((previo) => {
      const siguiente = new Set(previo);
      for (const permiso of visibles) {
        if (debeMarcar(permiso)) siguiente.add(permiso);
        else siguiente.delete(permiso);
      }
      return siguiente;
    });
  }

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
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
        {`Permisos del rol ${NOMBRE_ROL[role]}: ${base.size} · ${cambios} ${cambios === 1 ? "cambio" : "cambios"}`}
      </p>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/50 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Buscar permiso"
            placeholder="Buscar permiso (orden, cotización, caja…)"
            className="pl-8"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pendiente} onClick={() => aplicarAVisibles(esDeVer)}>
            Solo lectura
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pendiente} onClick={() => aplicarAVisibles(() => true)}>
            Marcar todos
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pendiente} onClick={() => aplicarAVisibles(() => false)}>
            Desmarcar todos
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GRUPOS_PERMISO.map((grupo) => {
          const delGrupo = VISIBLES.filter((p) => PERMISOS[p].grupo === grupo);
          const deGrupo = visibles.filter((p) => PERMISOS[p].grupo === grupo);
          if (deGrupo.length === 0) return null;
          const { icono: Icono, tono } = ICONO_GRUPO[grupo];
          const activos = delGrupo.filter((p) => marcados.has(p)).length;
          return (
            <fieldset key={grupo} className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 shadow-sm">
              <legend className="sr-only">{grupo}</legend>
              <div aria-hidden className="mb-2 flex items-center gap-2 border-b border-border pb-2">
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", KPI_TONE[tono].iconBg)}>
                  <Icono className={cn("size-4", KPI_TONE[tono].icon)} />
                </span>
                <span className="flex-1 text-sm font-semibold">{grupo}</span>
              </div>
              <span className="-mt-9 mb-2 self-end rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {`${activos} / ${delGrupo.length} activos`}
              </span>
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
