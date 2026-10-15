import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAutoguardado } from "./use-autoguardado";

type Estado = { error: string | null; success: boolean };
const INICIAL: Estado = { error: null, success: false };

function datos(clave: string, valor: string) {
  const formData = new FormData();
  formData.set(clave, valor);
  return formData;
}

describe("useAutoguardado", () => {
  it("envía en orden, de a uno, y termina en guardado", async () => {
    const vistos: string[] = [];
    let soltar!: () => void;
    const primera = new Promise<void>((resolve) => (soltar = resolve));
    const accion = vi.fn(async (_prev: Estado, formData: FormData) => {
      vistos.push(String(formData.get("k")));
      if (formData.get("k") === "a") await primera;
      return { error: null, success: true };
    });
    const { result } = renderHook(() => useAutoguardado(accion, INICIAL));

    act(() => {
      result.current.guardar(datos("k", "a"));
      result.current.guardar(datos("k", "b"));
    });
    expect(result.current.fase).toBe("guardando");
    await waitFor(() => expect(vistos).toEqual(["a"]));
    soltar();
    await waitFor(() => expect(result.current.fase).toBe("guardado"));
    expect(vistos).toEqual(["a", "b"]);
  });

  it("si la acción responde error, queda en error con su mensaje", async () => {
    const accion = vi.fn(async () => ({ error: "La orden ya no se puede modificar", success: false }));
    const { result } = renderHook(() => useAutoguardado(accion, INICIAL));
    act(() => result.current.guardar(datos("k", "a")));
    await waitFor(() => expect(result.current.fase).toBe("error"));
    expect(result.current.error).toBe("La orden ya no se puede modificar");
  });

  it("si la acción revienta, también avisa", async () => {
    const accion = vi.fn(async () => {
      throw new Error("red");
    });
    const { result } = renderHook(() => useAutoguardado(accion, INICIAL));
    act(() => result.current.guardar(datos("k", "a")));
    await waitFor(() => expect(result.current.fase).toBe("error"));
    expect(result.current.error).toBe("No se pudo guardar. Revisa la conexión e intenta de nuevo.");
  });
});
