"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Celda de la tabla de conceptos que se ve como texto y se edita en el sitio.
 * Guarda sola al salir (Tab o clic afuera) y con Enter; Esc deshace. Si el
 * guardado falla, vuelve al valor anterior: el error lo muestra quien guarda.
 */
export function CeldaEditable({
  celda,
  etiqueta,
  valor,
  formato,
  interpretar,
  onGuardar,
  onEnter,
  className,
  alinear = "derecha",
}: {
  /** Identifica la celda para devolverle el foco: "<itemId>:<campo>". */
  celda: string;
  etiqueta: string;
  valor: string;
  /** Cómo se ve sin foco (p. ej. moneda); con foco se edita el valor crudo. */
  formato?: (valor: string) => string;
  /** Convierte lo escrito al valor a guardar; null si no es válido. */
  interpretar: (texto: string) => string | null;
  onGuardar: (nuevo: string) => Promise<boolean>;
  onEnter?: () => void;
  className?: string;
  alinear?: "derecha" | "izquierda";
}) {
  const [texto, setTexto] = useState(valor);
  const [conFoco, setConFoco] = useState(false);
  /** Lo recién guardado se muestra mientras llega el valor nuevo de la base. */
  const [guardando, setGuardando] = useState<string | null>(null);
  const [valorAnterior, setValorAnterior] = useState(valor);
  const descartar = useRef(false);
  const enterPulsado = useRef(false);

  // Cuando la base trae un valor nuevo, manda sobre lo que se estaba mostrando.
  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    setGuardando(null);
    if (!conFoco) setTexto(valor);
  }

  async function confirmar() {
    const nuevo = interpretar(texto);
    if (nuevo === null || nuevo === valor) {
      setTexto(valor);
      return;
    }
    setTexto(nuevo);
    setGuardando(nuevo);
    const guardado = await onGuardar(nuevo);
    if (!guardado) {
      setGuardando(null);
      setTexto(valor);
    }
  }

  const visible = conFoco ? texto : (guardando ?? valor);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      enterPulsado.current = true;
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      descartar.current = true;
      event.currentTarget.blur();
    }
  }

  return (
    <input
      type="text"
      inputMode={alinear === "derecha" ? "decimal" : "text"}
      aria-label={etiqueta}
      data-celda={celda}
      value={conFoco || !formato ? visible : formato(visible)}
      onChange={(event) => setTexto(event.target.value)}
      onFocus={(event) => {
        setTexto(guardando ?? valor);
        setConFoco(true);
        event.currentTarget.select();
      }}
      onBlur={() => {
        setConFoco(false);
        if (descartar.current) {
          descartar.current = false;
          setTexto(valor);
        } else {
          void confirmar();
        }
        if (enterPulsado.current) {
          enterPulsado.current = false;
          onEnter?.();
        }
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 font-mono text-sm outline-none transition-colors",
        "hover:border-border focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30",
        alinear === "derecha" ? "text-right" : "text-left font-sans",
        className,
      )}
    />
  );
}

/** "38.000", "$ 38.000" o "38000,5" → "38000.5". Punto = miles, coma = decimales (es-CO). */
export function interpretarPrecio(texto: string): string | null {
  const limpio = texto.replace(/[^\d,]/g, "").replace(",", ".");
  if (limpio === "" || Number.isNaN(Number(limpio))) return null;
  const numero = Number(limpio);
  return numero < 0 ? null : String(numero);
}

/** "2", "1,5" o "1.5" → número mayor a 0 con hasta 2 decimales. */
export function interpretarCantidad(texto: string): string | null {
  const numero = Number(texto.trim().replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0 || numero > 9999) return null;
  return String(Math.round(numero * 100) / 100);
}
