"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AbonoCuentaDialog, type CuentaAbono } from "./abono-cuenta-dialog";

interface ContextoAbonos {
  abrirCuenta: (cuenta: CuentaAbono) => void;
}

const AbonosContext = createContext<ContextoAbonos>({ abrirCuenta: () => {} });

/**
 * Un solo diálogo para toda la lista, fuera de las filas: al saldar una cuenta
 * la página se vuelve a pintar sin esa fila, y si el diálogo viviera dentro de
 * ella se cerraría antes de mostrar el resultado.
 */
export function AbonosProvider({
  cajaAbierta,
  abonadas,
  children,
}: {
  cajaAbierta: boolean;
  /** Cuentas abonadas desde esta pantalla (`?abonada=`), que la lista resalta. */
  abonadas: string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [cuenta, setCuenta] = useState<CuentaAbono | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [version, setVersion] = useState(0);

  // El resaltado dura hasta recargar: se quita `?abonada=` de la barra sin volver a pedir la página.
  useEffect(() => {
    if (abonadas.length === 0) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("abonada")) return;
    url.searchParams.delete("abonada");
    window.history.replaceState(window.history.state, "", url);
  }, [abonadas]);

  // Con `?abonada=` la página mantiene la fila aunque haya quedado pagada (nada se esconde sin aviso).
  const marcarAbonada = useCallback(
    (cuentaId: string) => {
      const ids = [...new Set([...abonadas, cuentaId])];
      router.replace(`/cuentas-por-pagar?abonada=${ids.map(encodeURIComponent).join(",")}`, { scroll: false });
    },
    [abonadas, router],
  );

  return (
    <AbonosContext.Provider
      value={{
        abrirCuenta: (nueva) => {
          setCuenta(nueva);
          setVersion((v) => v + 1);
          setAbierto(true);
        },
      }}
    >
      {children}
      {cuenta ? (
        <AbonoCuentaDialog
          cuenta={cuenta}
          version={version}
          cajaAbierta={cajaAbierta}
          open={abierto}
          onOpenChange={setAbierto}
          onRegistrado={marcarAbonada}
          onOtroAbono={(actualizada) => {
            setCuenta(actualizada);
            setVersion((v) => v + 1);
          }}
        />
      ) : null}
    </AbonosContext.Provider>
  );
}

/** El botón «Abonar» de cada fila. */
export function BotonAbonar({ cuenta }: { cuenta: CuentaAbono }) {
  const { abrirCuenta } = useContext(AbonosContext);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => abrirCuenta(cuenta)}
      aria-label={`Abonar a la entrada del ${cuenta.fechaTexto} de ${cuenta.proveedorNombre}`}
      className="border-primary/45 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
    >
      <HandCoins aria-hidden />
      Abonar
    </Button>
  );
}
