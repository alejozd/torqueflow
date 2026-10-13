import { z } from "zod";

/**
 * Un campo numérico de formulario llega como `""` cuando el usuario lo deja
 * vacío; sin esto, `z.coerce.number()` lo convertiría en 0 en vez de tratarlo
 * como "no enviado" (que es lo que espera un `.optional()`).
 */
export const vacioComoUndefined = (valor: unknown) => (valor === "" || valor === null ? undefined : valor);

export const requiredMoney = (msg: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number({ error: msg }).min(0, msg),
  );
