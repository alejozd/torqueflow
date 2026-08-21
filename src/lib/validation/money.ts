import { z } from "zod";

export const requiredMoney = (msg: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number({ error: msg }).min(0, msg),
  );
