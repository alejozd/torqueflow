"use client";

import { useMemo, useState } from "react";
import { Combobox } from "@/components/ui/combobox";

export interface MunicipioOpcion {
  codigo: string;
  nombre: string;
  departamento: string;
}

/** Buscador de municipio (código DANE). La lista llega del servidor para no cargar el núcleo en el navegador. */
export function CampoMunicipio({
  municipios,
  name,
  defaultValue,
  id,
}: {
  municipios: MunicipioOpcion[];
  name: string;
  defaultValue: string | null;
  id: string;
}) {
  const [valor, setValor] = useState(defaultValue ?? "");
  const items = useMemo(
    () => municipios.map((m) => ({ value: m.codigo, label: `${m.nombre} (${m.departamento}) · ${m.codigo}` })),
    [municipios],
  );
  return (
    <>
      <Combobox id={id} items={items} value={valor} onValueChange={setValor} placeholder="Buscar municipio..." />
      <input type="hidden" name={name} value={valor} />
    </>
  );
}
