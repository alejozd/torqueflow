import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const MES_ANIO = new Intl.DateTimeFormat("es-CO", {
  month: "long",
  year: "numeric",
  timeZone: "America/Bogota",
});

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]!.toUpperCase())
    .join("");
}

/** Tarjeta superior de la ficha del usuario (rediseño, tarea 1): quién es y en qué estado está. */
export function CabeceraUsuario({
  nombre,
  email,
  activo,
  createdAt,
}: {
  nombre: string;
  email: string;
  activo: boolean;
  createdAt: Date;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-xl font-bold text-white shadow-sm"
        >
          {iniciales(nombre)}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold">{nombre}</h2>
            {activo ? (
              <Badge className="gap-1.5 border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]">
                <span className="size-1.5 shrink-0 rounded-full bg-[oklch(0.4_0.1_150)]" />
                Activo
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5">
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                Suspendido
              </Badge>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {email} · Miembro desde {MES_ANIO.format(createdAt)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
