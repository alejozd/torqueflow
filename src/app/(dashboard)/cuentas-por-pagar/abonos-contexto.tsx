"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AbonoCuentaDialog, type CuentaAbono } from "./abono-cuenta-dialog";
import { AbonoProveedorDialog, type ProveedorAbono } from "./abono-proveedor-dialog";

interface ContextoAbonos {
  abrirCuenta: (cuenta: CuentaAbono) => void;
  abrirProveedor: (proveedor: ProveedorAbono) => void;
}

const AbonosContext = createContext<ContextoAbonos>({ abrirCuenta: () => {}, abrirProveedor: () => {} });

type Abierto = { tipo: "cuenta"; cuenta: CuentaAbono } | { tipo: "proveedor"; proveedor: ProveedorAbono };

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
  const [actual, setActual] = useState<Abierto | null>(null);
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

  // Con `?abonada=` la página mantiene las filas aunque hayan quedado pagadas (nada se esconde sin aviso).
  const marcarAbonadas = useCallback(
    (cuentaIds: string[]) => {
      const ids = [...new Set([...abonadas, ...cuentaIds])];
      router.replace(`/cuentas-por-pagar?abonada=${ids.map(encodeURIComponent).join(",")}`, { scroll: false });
    },
    [abonadas, router],
  );
  const marcarAbonada = useCallback((cuentaId: string) => marcarAbonadas([cuentaId]), [marcarAbonadas]);

  function abrir(nuevo: Abierto) {
    setActual(nuevo);
    setVersion((v) => v + 1);
    setAbierto(true);
  }

  return (
    <AbonosContext.Provider
      value={{
        abrirCuenta: (cuenta) => abrir({ tipo: "cuenta", cuenta }),
        abrirProveedor: (proveedor) => abrir({ tipo: "proveedor", proveedor }),
      }}
    >
      {children}
      {actual?.tipo === "cuenta" ? (
        <AbonoCuentaDialog
          cuenta={actual.cuenta}
          version={version}
          cajaAbierta={cajaAbierta}
          open={abierto}
          onOpenChange={setAbierto}
          onRegistrado={marcarAbonada}
          onOtroAbono={(actualizada) => {
            setActual({ tipo: "cuenta", cuenta: actualizada });
            setVersion((v) => v + 1);
          }}
        />
      ) : actual?.tipo === "proveedor" ? (
        <AbonoProveedorDialog
          proveedor={actual.proveedor}
          version={version}
          cajaAbierta={cajaAbierta}
          open={abierto}
          onOpenChange={setAbierto}
          onRegistrado={marcarAbonadas}
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

/** «Abonar al proveedor»: un pago repartido entre sus entradas (solo con dos o más por pagar). */
export function BotonAbonarProveedor({ proveedor }: { proveedor: ProveedorAbono }) {
  const { abrirProveedor } = useContext(AbonosContext);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => abrirProveedor(proveedor)}
      title="Reparte un pago entre varias entradas, de la más vieja a la más nueva"
    >
      <HandCoins aria-hidden />
      Abonar al proveedor
    </Button>
  );
}
