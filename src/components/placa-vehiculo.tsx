import { cn } from "@/lib/utils";

/**
 * La placa como se ve en la calle: amarilla, borde negro y «COLOMBIA» arriba.
 * Es el dato con el que el taller reconoce el carro, así que es el punto focal
 * de las cabeceras. Se renderiza como el título de la página (h1).
 */
export function PlacaVehiculo({ placa, className }: { placa: string; className?: string }) {
  return (
    <h1
      className={cn(
        "inline-flex flex-col items-center rounded-md border-2 border-neutral-900 bg-[oklch(0.86_0.17_92)] px-3 pt-0.5 pb-1 leading-none text-neutral-900 shadow-[inset_0_0_0_2px_oklch(0.86_0.17_92),inset_0_0_0_3px_rgb(0_0_0/0.25)]",
        className,
      )}
    >
      <span className="text-[8px] font-semibold tracking-[0.25em]" aria-hidden>
        COLOMBIA
      </span>
      <span className="font-mono text-2xl font-bold tracking-[0.12em]">{placa.toUpperCase()}</span>
    </h1>
  );
}
