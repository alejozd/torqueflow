import Link from "next/link";
import { requireSession } from "@/lib/auth/guards";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SinPermisoPage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardHeader>
          <CardTitle>No tienes permiso para ver esto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Si lo necesitas, pídele al administrador del taller que te lo habilite.
          </p>
          <Link href="/" className={buttonVariants()}>
            Volver al inicio
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
