import { describe, expect, it } from "vitest";
import { sedeInputSchema, usuarioSedesInputSchema } from "./sede";

describe("sedeInputSchema", () => {
  it("accepts a nombre with an empty direccion", () => {
    const result = sedeInputSchema.safeParse({ nombre: "Sede norte", direccion: "" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ nombre: "Sede norte", direccion: "" });
  });

  it("accepts a nombre with a direccion", () => {
    const result = sedeInputSchema.safeParse({ nombre: "Sede norte", direccion: "Calle 1 #2-3" });

    expect(result.success).toBe(true);
  });

  it("rejects an empty nombre with the Spanish message", () => {
    const result = sedeInputSchema.safeParse({ nombre: "", direccion: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("El nombre es obligatorio");
  });

  it("rejects a null nombre with the same Spanish message (the ?? \"\" formData guard)", () => {
    const result = sedeInputSchema.safeParse({ nombre: null, direccion: "" });

    expect(result.success).toBe(false);
  });
});

describe("usuarioSedesInputSchema", () => {
  it("accepts one or more sede ids", () => {
    const result = usuarioSedesInputSchema.safeParse({ sedeIds: ["sede-1", "sede-2"] });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ sedeIds: ["sede-1", "sede-2"] });
  });

  it("rejects an empty selection with the Spanish message", () => {
    const result = usuarioSedesInputSchema.safeParse({ sedeIds: [] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Selecciona al menos una sede");
  });

  it("rejects non-string entries", () => {
    const result = usuarioSedesInputSchema.safeParse({ sedeIds: [42] });

    expect(result.success).toBe(false);
  });
});
