"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SelectField } from "@/components/ui/select-field";

const TODOS = "TODOS";

const ESTADO_ITEMS = [
  { value: TODOS, label: "Todos los estados" },
  { value: "ACTIVO", label: "Activo" },
  { value: "SUSPENDIDO", label: "Suspendido" },
];

export function TenantFiltros({ planes }: { planes: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function actualizarParametro(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor && valor !== TODOS) params.set(clave, valor);
    else params.delete(clave);
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  const planItems = [
    { value: TODOS, label: "Todos los planes" },
    ...planes.map((plan) => ({ value: plan.id, label: plan.nombre })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      <SelectField
        items={ESTADO_ITEMS}
        value={searchParams.get("estado") ?? TODOS}
        onValueChange={(valor) => actualizarParametro("estado", valor)}
        className="w-44"
      />
      <SelectField
        items={planItems}
        value={searchParams.get("planId") ?? TODOS}
        onValueChange={(valor) => actualizarParametro("planId", valor)}
        className="w-44"
      />
    </div>
  );
}
