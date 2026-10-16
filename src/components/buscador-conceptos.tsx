"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Una fila de la lista de resultados, ya lista para pintar. */
export interface OpcionBuscador<S> {
  clave: string;
  /** Lo que recibe `onSeleccionar` al elegirla. */
  valor: S;
  /** Título de la sección; se muestra cuando cambia respecto a la fila anterior. */
  seccion?: string;
  contenido: ReactNode;
  /** Se muestra atenuada y no se agrega; este texto se anuncia al intentarlo. */
  noDisponible?: string;
}

const ESPERA_MS = 200;

/**
 * Campo único de captura con lista de resultados (flechas para moverse, Enter
 * para agregar, Esc para cerrar). La búsqueda y el pintado de cada resultado los
 * pone quien lo usa: lo comparten la tabla de la cotización y el mostrador.
 * `aOpciones` se evalúa en cada render, así que puede depender del estado del
 * llamador (p. ej. lo que ya hay en el carrito).
 */
export function BuscadorConceptos<R, S>({
  buscar,
  vacio,
  aOpciones,
  onSeleccionar,
  ocupado = false,
  placeholder,
  etiqueta,
  inputRef,
  onFlechaAbajo,
  alEnterSinResultados,
}: {
  buscar: (texto: string) => Promise<R>;
  vacio: R;
  aOpciones: (resultados: R, texto: string) => OpcionBuscador<S>[];
  onSeleccionar: (valor: S) => void;
  ocupado?: boolean;
  placeholder: string;
  etiqueta: string;
  inputRef?: Ref<HTMLInputElement>;
  /** ↓ con la lista cerrada (nada que recorrer): el mostrador lo usa para bajar a la primera fila del carrito. */
  onFlechaAbajo?: () => void;
  /**
   * Enter con texto mientras la búsqueda sigue pendiente (un lector de códigos
   * escribe y envía Enter en milisegundos) o sin resultados. Quien lo usa busca
   * y agrega por su cuenta: devuelve `null` si agregó (se limpia el campo) o el
   * mensaje a anunciar si no. Sin esta prop el comportamiento no cambia.
   */
  alEnterSinResultados?: (texto: string) => Promise<string | null>;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<R>(vacio);
  /** Texto al que corresponden los resultados mostrados; si difiere del escrito, se está buscando. */
  const [textoBuscado, setTextoBuscado] = useState<string | null>(null);
  const [activa, setActiva] = useState(0);
  const [aviso, setAviso] = useState("");
  const ultimaBusqueda = useRef(0);
  const resolviendo = useRef(false);
  const temporizadorAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listaId = useId();
  const buscando = abierto && textoBuscado !== texto;

  useEffect(() => {
    if (!abierto) return;
    const numero = ++ultimaBusqueda.current;
    const temporizador = setTimeout(async () => {
      let encontrados = vacio;
      try {
        encontrados = await buscar(texto);
      } catch {
        // Sin resultados: el usuario aún puede agregar lo escrito como ítem libre.
      }
      // Una respuesta lenta de una búsqueda vieja no pisa la más reciente.
      if (numero === ultimaBusqueda.current) {
        setResultados(encontrados);
        setTextoBuscado(texto);
      }
    }, ESPERA_MS);
    return () => clearTimeout(temporizador);
    // `buscar` y `vacio` vienen estables del llamador; solo el texto dispara la búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, abierto]);

  // Que no quede un temporizador de aviso vivo al desmontar.
  useEffect(
    () => () => {
      if (temporizadorAviso.current) clearTimeout(temporizadorAviso.current);
    },
    [],
  );

  function limpiarAviso() {
    if (temporizadorAviso.current) clearTimeout(temporizadorAviso.current);
    temporizadorAviso.current = null;
    setAviso("");
  }

  /** Vacía y vuelve a poner el texto para que el lector de pantalla lo repita en un intento repetido. */
  function anunciar(mensaje: string) {
    limpiarAviso();
    temporizadorAviso.current = setTimeout(() => {
      temporizadorAviso.current = null;
      setAviso(mensaje);
    }, 50);
  }

  const opciones = aOpciones(resultados, texto);
  const indiceActivo = Math.min(activa, Math.max(opciones.length - 1, 0));

  function elegir(opcion: OpcionBuscador<S>) {
    if (opcion.noDisponible) {
      anunciar(opcion.noDisponible);
      return;
    }
    limpiarAviso();
    setTexto("");
    setActiva(0);
    setAbierto(false);
    setResultados(vacio);
    setTextoBuscado(null);
    onSeleccionar(opcion.valor);
  }

  const mostrarLista = abierto && (opciones.length > 0 || buscando);

  /** Enter sin resultados fiables (lector de códigos): lo resuelve el llamador y, si agrega, se limpia el campo. */
  async function resolverSinResultados() {
    if (!alEnterSinResultados || resolviendo.current) return;
    resolviendo.current = true;
    const buscado = texto.trim();
    // Cualquier búsqueda en curso queda descartada: no puede reabrir la lista ni dejar un resultado viejo.
    ultimaBusqueda.current++;
    let mensaje: string | null;
    try {
      mensaje = await alEnterSinResultados(buscado);
    } catch {
      mensaje = "No se pudo buscar. Intenta de nuevo";
    } finally {
      resolviendo.current = false;
    }
    if (mensaje === null) {
      limpiarAviso();
      setTexto("");
      setActiva(0);
      setAbierto(false);
      setResultados(vacio);
      setTextoBuscado(null);
    } else {
      // La búsqueda pendiente quedó descartada: sin cerrar la lista, "Buscando…" se quedaría para siempre.
      setAbierto(false);
      anunciar(mensaje);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      limpiarAviso();
      if ((texto === "" || !mostrarLista) && onFlechaAbajo) {
        onFlechaAbajo();
        return;
      }
      setAbierto(true);
      setActiva((i) => Math.min(i + 1, opciones.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      limpiarAviso();
      setActiva((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (ocupado) return;
      if (alEnterSinResultados && texto.trim() !== "" && (buscando || opciones.length === 0)) {
        void resolverSinResultados();
        return;
      }
      const opcion = opciones[indiceActivo];
      if (abierto && opcion) elegir(opcion);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setAbierto(false);
      setTexto("");
      limpiarAviso();
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 focus-within:border-ring focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/30">
        {ocupado ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={etiqueta}
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={mostrarLista && opciones[indiceActivo] ? `${listaId}-${opciones[indiceActivo].clave}` : undefined}
          placeholder={placeholder}
          value={texto}
          onChange={(event) => {
            setTexto(event.target.value);
            setActiva(0);
            setAbierto(true);
            limpiarAviso();
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
          onKeyDown={onKeyDown}
          className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>

      {mostrarLista ? (
        <ul
          id={listaId}
          role="listbox"
          aria-label="Resultados"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {opciones.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">Buscando…</li> : null}
          {opciones.map((opcion, indice) => {
            const primeraDeSeccion = indice === 0 || opciones[indice - 1].seccion !== opcion.seccion;
            return (
              <li key={opcion.clave} role="presentation">
                {primeraDeSeccion && opcion.seccion ? (
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {opcion.seccion}
                  </p>
                ) : null}
                <div
                  id={`${listaId}-${opcion.clave}`}
                  role="option"
                  aria-selected={indice === indiceActivo}
                  aria-disabled={opcion.noDisponible ? true : undefined}
                  // mousedown y no click: el blur del campo cerraría la lista antes del click.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    if (!ocupado) elegir(opcion);
                  }}
                  onMouseEnter={() => setActiva(indice)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm",
                    indice === indiceActivo && "bg-accent text-accent-foreground",
                    opcion.noDisponible && "cursor-not-allowed opacity-50",
                  )}
                >
                  {opcion.contenido}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
