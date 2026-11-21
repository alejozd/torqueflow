"use client";

import { useActionState } from "react";
import { guardarDatosFeClienteAction, type DatosFeClienteState } from "@/app/actions/cliente-fe-actions";
import { CampoMunicipio, type MunicipioOpcion } from "@/components/campo-municipio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const inicial: DatosFeClienteState = { error: null, success: false };

const TIPOS_DOCUMENTO = [
  { value: "13", label: "Cédula de ciudadanía" },
  { value: "31", label: "NIT" },
  { value: "22", label: "Cédula de extranjería" },
  { value: "41", label: "Pasaporte" },
  { value: "12", label: "Tarjeta de identidad" },
  { value: "47", label: "PEP" },
];

const RESPONSABILIDADES = [
  { value: "R-99-PN", label: "No responsable" },
  { value: "O-13", label: "Gran contribuyente" },
  { value: "O-15", label: "Autorretenedor" },
  { value: "O-23", label: "Agente de retención de IVA" },
  { value: "O-47", label: "Régimen simple de tributación" },
];

/** Solo los campos que se editan aquí; el estado (completos o no) lo calcula el servidor. */
export interface ClienteFe {
  id: string;
  tipoDocumento: string | null;
  dv: string | null;
  tipoPersona: string | null;
  responsabilidadFiscal: string | null;
  municipioCodigo: string | null;
  direccion: string | null;
}

export function DatosFeCliente({
  cliente,
  estado,
  municipios,
  puedeEditar,
}: {
  cliente: ClienteFe;
  estado: { completo: boolean; texto: string };
  municipios: MunicipioOpcion[];
  puedeEditar: boolean;
}) {
  const [state, formAction, pendiente] = useActionState(guardarDatosFeClienteAction.bind(null, cliente.id), inicial);

  return (
    <details id="factura-electronica" className="scroll-mt-16 rounded-xl border border-border bg-card p-4">
      <summary className="flex cursor-pointer items-center justify-between gap-2 font-semibold">
        <span>Datos para factura electrónica</span>
        <Badge variant="outline" className="font-normal">
          {estado.texto}
        </Badge>
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">Estos datos se usarán cuando el taller active la facturación electrónica.</p>
      <form action={formAction}>
        {/* Sin permiso de editar los campos quedan bloqueados (no hay botón de guardar). */}
        <fieldset disabled={!puedeEditar} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-tipo">Tipo de documento</Label>
          <SelectField id="cfe-tipo" name="tipoDocumento" defaultValue={cliente.tipoDocumento ?? ""} items={TIPOS_DOCUMENTO} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-dv">DV (solo con NIT)</Label>
          <Input id="cfe-dv" name="dv" maxLength={1} inputMode="numeric" defaultValue={cliente.dv ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-persona">Tipo de persona</Label>
          <SelectField
            id="cfe-persona"
            name="tipoPersona"
            defaultValue={cliente.tipoPersona ?? ""}
            items={[
              { value: "NATURAL", label: "Persona natural" },
              { value: "JURIDICA", label: "Empresa (persona jurídica)" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-resp">Responsabilidad fiscal</Label>
          <SelectField id="cfe-resp" name="responsabilidadFiscal" defaultValue={cliente.responsabilidadFiscal ?? ""} items={RESPONSABILIDADES} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-municipio">Municipio</Label>
          <CampoMunicipio id="cfe-municipio" name="municipioCodigo" defaultValue={cliente.municipioCodigo} municipios={municipios} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-direccion">Dirección</Label>
          <Input id="cfe-direccion" name="direccion" defaultValue={cliente.direccion ?? ""} />
        </div>
        {state.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
        {state.success ? <p className="text-sm sm:col-span-2">Datos guardados.</p> : null}
        {puedeEditar ? (
          <Button type="submit" size="sm" className="self-start" disabled={pendiente}>
            Guardar datos
          </Button>
        ) : null}
        </fieldset>
      </form>
    </details>
  );
}
