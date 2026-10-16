import { cn } from "@/lib/utils";

/**
 * La placa como se ve en la calle: amarilla con borde negro. Es el dato con el
 * que el taller reconoce el carro, así que es el punto focal de las cabeceras;
 * compacta para no robarle espacio al resto. Por defecto es el título (h1);
 * en listas va como `span`.
 */
export function PlacaVehiculo({
  placa,
  className,
  as: Etiqueta = "h1",
}: {
  placa: string;
  className?: string;
  as?: "h1" | "span";
}) {
  return (
    <Etiqueta
      className={cn(
        "inline-flex items-center rounded-md border-2 border-neutral-900 bg-[oklch(0.86_0.17_92)] px-2 py-0.5 font-mono text-lg leading-tight font-bold tracking-[0.1em] text-neutral-900",
        className,
      )}
    >
      {placa.toUpperCase()}
    </Etiqueta>
  );
}
