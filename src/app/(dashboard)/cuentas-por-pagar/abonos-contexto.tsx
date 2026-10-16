"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
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
export function AbonosProvider({ children }: { children: ReactNode }) {
  const [cuenta, setCuenta] = useState<CuentaAbono | null>(null);
  const [abierto, setAbierto] = useState(false);

  return (
    <AbonosContext.Provider
      value={{
        abrirCuenta: (nueva) => {
          setCuenta(nueva);
          setAbierto(true);
        },
      }}
    >
      {children}
      {cuenta ? <AbonoCuentaDialog cuenta={cuenta} open={abierto} onOpenChange={setAbierto} /> : null}
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
