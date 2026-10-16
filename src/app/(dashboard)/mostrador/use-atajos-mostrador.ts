"use client";

import { useEffect, useRef } from "react";

export interface AtajosMostrador {
  focusBuscador: () => void;
  /** F9 o Ctrl+Enter. Quien lo usa decide si lleva al bloque de cobro o cobra. */
  irACobrar: () => void;
  /** F2 */
  buscarCliente: () => void;
  /** F4 */
  descuento: () => void;
  /** `?` fuera de un campo: muestra la lista de atajos. */
  ayuda?: () => void;
}

function estaEscribiendo(destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false;
  return destino.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(destino.tagName);
}

/**
 * Atajos globales del mostrador (spec §4.4). Las teclas F no chocan con escribir;
 * `/` solo cuenta fuera de un campo, para poder teclear una barra en el buscador.
 * No se toman F5, F11 ni Ctrl+N/T/W: son del navegador.
 */
export function useAtajosMostrador(handlers: AtajosMostrador) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const accion = (fn: () => void) => {
        event.preventDefault();
        fn();
      };
      const h = ref.current;
      if (event.key === "F1") accion(h.focusBuscador);
      else if (event.key === "F2") accion(h.buscarCliente);
      else if (event.key === "F4") accion(h.descuento);
      else if (event.key === "F9" || (event.key === "Enter" && event.ctrlKey)) accion(h.irACobrar);
      else if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !estaEscribiendo(event.target)) {
        accion(h.focusBuscador);
      } else if (event.key === "?" && h.ayuda && !event.ctrlKey && !event.metaKey && !event.altKey && !estaEscribiendo(event.target)) {
        accion(h.ayuda);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
