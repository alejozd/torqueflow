import { describe, expect, it } from "vitest";
import { assertSafeSchemaName } from "./schema-name";

describe("assertSafeSchemaName", () => {
  it.each(["taller_perez", "t", "taller_2"])("acepta snake_case en minúsculas: %j", (nombre) => {
    expect(() => assertSafeSchemaName(nombre)).not.toThrow();
  });

  it.each(['x"; DROP SCHEMA public; --', 'taller"perez', "Taller", "1taller", "_taller", "taller-perez", ""])(
    "rechaza %j",
    (nombre) => {
      expect(() => assertSafeSchemaName(nombre)).toThrow(/Invalid schema name/);
    },
  );
});
