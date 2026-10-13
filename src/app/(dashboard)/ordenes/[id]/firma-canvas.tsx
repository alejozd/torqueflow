"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { agregarPunto, hayTrazo, limitarPunto, pintarTrazos, type Punto, type Trazo } from "@/lib/firma/trazo";

const ANCHO = 600;
const ALTO = 180;
const GROSOR = 2.2;
const COLOR = "#111827";

/**
 * Firma en pantalla (D5). El trazo se convierte a un data URL PNG que viaja en un
 * campo oculto del formulario: la acción lo valida (magic bytes y tamaño) y lo
 * guarda como cualquier otro archivo de la orden.
 *
 * El dibujo en sí no se puede probar en jsdom (no hay canvas), así que la lógica
 * de puntos vive en `src/lib/firma/trazo.ts` y aquí solo se pinta.
 */
export function FirmaCanvas({ name = "firmaDataUrl" }: { name?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  const [dataUrl, setDataUrl] = useState("");
  const dibujando = useRef(false);

  function puntoDe(evento: React.PointerEvent<HTMLCanvasElement>): Punto {
    const rectangulo = evento.currentTarget.getBoundingClientRect();
    return limitarPunto({ x: evento.clientX - rectangulo.left, y: evento.clientY - rectangulo.top }, ANCHO, ALTO);
  }

  function pintar(siguientes: Trazo[]) {
    const contexto = canvasRef.current?.getContext("2d");
    if (!contexto) return;
    contexto.lineWidth = GROSOR;
    contexto.lineCap = "round";
    contexto.lineJoin = "round";
    contexto.strokeStyle = COLOR;
    pintarTrazos(contexto, siguientes, ANCHO, ALTO);
  }

  function actualizar(siguientes: Trazo[]) {
    setTrazos(siguientes);
    pintar(siguientes);
    // El data URL se calcula aquí (y no en un efecto) para no re-renderizar de más.
    setDataUrl(hayTrazo(siguientes) ? (canvasRef.current?.toDataURL("image/png") ?? "") : "");
  }

  function alBajar(evento: React.PointerEvent<HTMLCanvasElement>) {
    evento.currentTarget.setPointerCapture(evento.pointerId);
    dibujando.current = true;
    actualizar([...trazos, [puntoDe(evento)]]);
  }

  function alMover(evento: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ultimo = trazos[trazos.length - 1] ?? [];
    const siguiente = agregarPunto(ultimo, puntoDe(evento));
    if (siguiente === ultimo) return;
    actualizar([...trazos.slice(0, -1), siguiente]);
  }

  function alSoltar() {
    dibujando.current = false;
    // Al cerrar el trazo se recalcula el data URL ya con el trazo completo.
    actualizar(trazos);
  }

  function limpiar() {
    setTrazos([]);
    setDataUrl("");
    pintar([]);
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={ANCHO}
        height={ALTO}
        role="img"
        aria-label="Firma de quien recibe"
        className="w-full max-w-xl touch-none rounded-md border border-dashed border-input bg-white"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerLeave={alSoltar}
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={limpiar} disabled={!hayTrazo(trazos)}>
          Limpiar firma
        </Button>
        <span className="text-xs text-muted-foreground">
          {hayTrazo(trazos) ? "Firma lista para guardar." : "Firma aquí con el mouse o el dedo."}
        </span>
      </div>
      {/* Lo que viaja al servidor: el PNG de la firma. */}
      <input type="hidden" name={name} value={dataUrl} />
    </div>
  );
}
