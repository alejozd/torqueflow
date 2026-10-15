"use client";

import { startTransition, useCallback, useRef, useState } from "react";
import type { FaseGuardado } from "@/components/estado-guardado";

/**
 * Guarda solo, sin botón: cada `guardar(formData)` llama a la server action
 * existente, de a una (dos cambios rápidos no se pisan en el servidor), dentro de
 * una transición para que Next refresque la página al terminar.
 */
export function useAutoguardado<T extends { error: string | null }>(
  accion: (prev: T, formData: FormData) => Promise<T>,
  inicial: T,
) {
  const [fase, setFase] = useState<FaseGuardado>("inactivo");
  const [error, setError] = useState<string | null>(null);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const pendientes = useRef(0);
  const ultimo = useRef(inicial);

  const guardar = useCallback(
    (formData: FormData) => {
      pendientes.current += 1;
      setFase("guardando");
      cola.current = cola.current.then(
        () =>
          new Promise<void>((terminar) => {
            startTransition(async () => {
              let resultado: T;
              try {
                resultado = await accion(ultimo.current, formData);
              } catch {
                resultado = { ...ultimo.current, error: "No se pudo guardar. Revisa la conexión e intenta de nuevo." };
              }
              ultimo.current = resultado;
              pendientes.current -= 1;
              if (resultado.error) {
                setError(resultado.error);
                setFase("error");
              } else if (pendientes.current === 0) {
                setError(null);
                setFase("guardado");
              }
              terminar();
            });
          }),
      );
    },
    [accion],
  );

  return { guardar, fase, error };
}
