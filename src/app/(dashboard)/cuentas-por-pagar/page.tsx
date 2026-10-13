import { getCuentasPorPagar } from "@/app/actions/cuenta-por-pagar-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AbonoCuentaForm } from "./abono-cuenta-form";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

const RANGOS = [
  { clave: "0-30", etiqueta: "0 a 30 días" },
  { clave: "31-60", etiqueta: "31 a 60 días" },
  { clave: "61-90", etiqueta: "61 a 90 días" },
  { clave: "90+", etiqueta: "Más de 90 días" },
] as const;

export default async function CuentasPorPagarPage() {
  const { proveedores, totales } = await getCuentasPorPagar();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Cuentas por pagar</h1>
        <p className="text-sm text-muted-foreground">
          Lo que el taller debe a sus proveedores. La deuda nace cuando entra la mercancía y se salda con abonos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total por pagar</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl font-semibold">{formatoMoneda.format(totales.total)}</p>
          </CardContent>
        </Card>
        {RANGOS.map((rango) => (
          <Card key={rango.clave}>
            <CardHeader className="pb-2">
              <CardDescription>{rango.etiqueta}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xl">{formatoMoneda.format(totales[rango.clave])}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {proveedores.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No hay cuentas pendientes: todo lo recibido está pagado.
          </CardContent>
        </Card>
      ) : (
        proveedores.map((proveedor) => (
          <Card key={proveedor.proveedorId}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{proveedor.proveedorNombre}</span>
                <span className="font-mono text-base">{formatoMoneda.format(proveedor.saldoTotal)}</span>
              </CardTitle>
              <CardDescription>
                {proveedor.cuentas.length} {proveedor.cuentas.length === 1 ? "cuenta" : "cuentas"} · la más antigua hace{" "}
                {proveedor.diasMasAntigua} {proveedor.diasMasAntigua === 1 ? "día" : "días"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {proveedor.cuentas.map((cuenta) => (
                <div key={cuenta.cuentaId} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      Entrada del {formatoFecha.format(cuenta.fecha)} ·{" "}
                      <span className="text-muted-foreground">total {formatoMoneda.format(cuenta.total)}</span>
                    </span>
                    <span className="font-mono font-medium">Saldo {formatoMoneda.format(cuenta.saldo)}</span>
                  </div>
                  <AbonoCuentaForm cuentaId={cuenta.cuentaId} saldo={cuenta.saldo} />
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
