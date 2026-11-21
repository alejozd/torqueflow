"use client";

import { useActionState, useState } from "react";
import {
  guardarConfiguracionFeAction,
  probarConexionFeAction,
  type ConfigFeFormState,
  type ConfiguracionFeVista,
} from "@/app/actions/factura-electronica-config-actions";
import type { MunicipioOpcion } from "@/components/campo-municipio";
import { CampoMunicipio } from "@/components/campo-municipio";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { formatoFechaRelativa } from "@/lib/fecha-bogota";

const inicial: ConfigFeFormState = { error: null, success: false, mensaje: null };

const AMBIENTES = [
  { value: "SIMULADO", label: "Simulado (para practicar, nada llega a la DIAN)" },
  { value: "PRUEBAS", label: "Pruebas de la DIAN (habilitación)" },
  { value: "PRODUCCION", label: "Producción (con validez ante la DIAN)" },
] as const;

const REGIMENES = [
  { value: "48", label: "Responsable de IVA" },
  { value: "49", label: "No responsable de IVA" },
];

const RESPONSABILIDADES = [
  { value: "O-13", label: "Gran contribuyente" },
  { value: "O-15", label: "Autorretenedor" },
  { value: "O-23", label: "Agente de retención de IVA" },
  { value: "O-47", label: "Régimen simple de tributación" },
  { value: "R-99-PN", label: "No responsable" },
];

const RESULTADOS_SIMULADOS = [
  { value: "ACEPTAR", label: "La DIAN acepta" },
  { value: "RECHAZAR", label: "La DIAN rechaza" },
  { value: "CAIDA", label: "Se cae la conexión (no llega)" },
  { value: "CAIDA_RECIBIDO", label: "Se cae la conexión pero la DIAN sí la recibió" },
];

export function ConfiguracionFeForm({
  configuracion: c,
  municipios,
  ahora,
}: {
  configuracion: ConfiguracionFeVista;
  municipios: MunicipioOpcion[];
  /** Hora del servidor para "Última prueba hace…" (sin depender del reloj del navegador). */
  ahora: Date;
}) {
  const [state, guardar, guardando] = useActionState(guardarConfiguracionFeAction, inicial);
  const [prueba, probar, probando] = useActionState(probarConexionFeAction, inicial);
  const [ambiente, setAmbiente] = useState(c.ambiente);
  const [cuenta, setCuenta] = useState(c.cuenta);
  const [confirmando, setConfirmando] = useState(false);
  const pideConfirmacion = ambiente === "PRODUCCION" && c.ambiente !== "PRODUCCION";

  return (
    <div className="flex flex-col gap-4">
      <form
        action={guardar}
        onSubmit={(e) => {
          if (pideConfirmacion && !confirmando) {
            e.preventDefault();
            setConfirmando(true);
          }
        }}
        className="flex flex-col gap-4"
      >
        <Card>
          <CardHeader>
            <CardTitle>Funcionamiento</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="activa" defaultChecked={c.activa} />
              Facturación electrónica activa
            </label>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-envio">Envío a la DIAN</Label>
              <SelectField
                id="fe-envio"
                name="envio"
                defaultValue={c.envio}
                items={[
                  { value: "AUTOMATICO", label: "Automático al crear la factura" },
                  { value: "MANUAL", label: "Manual, con el botón de la factura" },
                ]}
              />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Ambiente</legend>
              {AMBIENTES.map((a) => (
                <label key={a.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="ambiente"
                    value={a.value}
                    checked={ambiente === a.value}
                    onChange={() => {
                      setAmbiente(a.value);
                      setConfirmando(false);
                    }}
                  />
                  {a.label}
                </label>
              ))}
            </fieldset>
            {ambiente === "SIMULADO" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fe-simulado">Resultado simulado</Label>
                <SelectField id="fe-simulado" name="resultadoSimulado" defaultValue={c.resultadoSimulado} items={RESULTADOS_SIMULADOS} />
              </div>
            ) : (
              <input type="hidden" name="resultadoSimulado" value={c.resultadoSimulado} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Datos del taller (emisor)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-nit">NIT (sin DV)</Label>
              <Input id="fe-nit" name="nit" inputMode="numeric" defaultValue={c.nit ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-dv">DV</Label>
              <Input id="fe-dv" name="dv" inputMode="numeric" maxLength={1} defaultValue={c.dv ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="fe-razon">Razón social</Label>
              <Input id="fe-razon" name="razonSocial" defaultValue={c.razonSocial ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-regimen">Régimen de IVA</Label>
              <SelectField id="fe-regimen" name="regimen" defaultValue={c.regimen ?? ""} items={REGIMENES} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-resp">Responsabilidad fiscal</Label>
              <SelectField id="fe-resp" name="responsabilidadFiscal" defaultValue={c.responsabilidadFiscal ?? ""} items={RESPONSABILIDADES} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-municipio">Municipio</Label>
              <CampoMunicipio id="fe-municipio" name="municipioCodigo" defaultValue={c.municipioCodigo} municipios={municipios} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-direccion">Dirección</Label>
              <Input id="fe-direccion" name="direccion" defaultValue={c.direccion ?? ""} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resolución de numeración</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-resolucion">Número de resolución</Label>
              <Input id="fe-resolucion" name="resolucionNumero" defaultValue={c.resolucionNumero ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-prefijo">Prefijo</Label>
              <Input id="fe-prefijo" name="prefijo" maxLength={4} defaultValue={c.prefijo ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-desde">Desde el número</Label>
              <Input id="fe-desde" name="rangoDesde" inputMode="numeric" defaultValue={c.rangoDesde ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-hasta">Hasta el número</Label>
              <Input id="fe-hasta" name="rangoHasta" inputMode="numeric" defaultValue={c.rangoHasta ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-vig-desde">Vigente desde</Label>
              <Input id="fe-vig-desde" name="vigenciaDesde" type="date" defaultValue={c.vigenciaDesde ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-vig-hasta">Vigente hasta</Label>
              <Input id="fe-vig-hasta" name="vigenciaHasta" type="date" defaultValue={c.vigenciaHasta ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-prefijo-nc">Prefijo de notas crédito</Label>
              <Input id="fe-prefijo-nc" name="prefijoNotaCredito" maxLength={4} defaultValue={c.prefijoNotaCredito ?? ""} />
            </div>
            <p className="self-end text-sm text-muted-foreground">
              Próximo número: {c.prefijo ?? ""}-{c.siguienteConsecutivo}
            </p>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Si cambias la resolución, el prefijo o el número inicial, la numeración vuelve a empezar en &quot;Desde el número&quot;.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cuenta del proveedor</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Cuenta</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="cuenta" value="BOLSA" checked={cuenta === "BOLSA"} onChange={() => setCuenta("BOLSA")} />
                Bolsa de TorqueFlow
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="cuenta" value="PROPIA" checked={cuenta === "PROPIA"} onChange={() => setCuenta("PROPIA")} />
                Cuenta propia del taller
              </label>
            </fieldset>
            {cuenta === "PROPIA" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fe-token">Token del proveedor</Label>
                <Input id="fe-token" name="token" type="password" autoComplete="off" defaultValue="" />
                <p className="text-xs text-muted-foreground">
                  {c.tokenConfigurado ? "Déjalo en blanco para conservar el token guardado." : "Aún no hay token guardado."}
                </p>
              </div>
            ) : (
              <>
                <input type="hidden" name="token" value="" />
                <p className="text-sm text-muted-foreground">Con la bolsa de TorqueFlow, el token lo registra TorqueFlow.</p>
              </>
            )}
          </CardContent>
        </Card>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success && state.mensaje ? (
          <Alert>
            <AlertDescription>{state.mensaje}</AlertDescription>
          </Alert>
        ) : null}

        {confirmando ? (
          <ConfirmacionEnLinea
            pregunta="¿Pasar a producción? Desde ahí las facturas tienen validez ante la DIAN."
            etiquetaConfirmar="Sí, pasar a producción"
            onCancelar={() => setConfirmando(false)}
            enviaFormulario
            nombreBoton="confirmarProduccion"
            valorBoton="si"
            pendiente={guardando}
          />
        ) : (
          <Button type="submit" className="self-start" disabled={guardando}>
            Guardar
          </Button>
        )}
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Probar conexión</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form action={probar}>
            <Button type="submit" variant="outline" disabled={probando}>
              Probar conexión
            </Button>
          </form>
          {prueba.error ? <p className="text-sm text-destructive">{prueba.error}</p> : null}
          {prueba.success && prueba.mensaje ? <p className="text-sm">{prueba.mensaje}</p> : null}
          {c.ultimaPruebaAt ? (
            <p className="text-xs text-muted-foreground">
              Última prueba {formatoFechaRelativa(c.ultimaPruebaAt, ahora)}:{" "}
              {c.ultimaPruebaExitosa ? "correcta" : "con problemas"}
              {c.ultimaPruebaMensaje ? ` — ${c.ultimaPruebaMensaje}` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
