"use client";

import { useState, type FormEvent, type Ref } from "react";
import { MessageCircle, UserPlus, X } from "lucide-react";
import { createClienteAction } from "@/app/actions/cliente-actions";
import { buscarClientesMostradorAction, type ClienteMostrador } from "@/app/actions/venta-mostrador-actions";
import { BuscadorConceptos, type OpcionBuscador } from "@/components/buscador-conceptos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { urlWhatsapp } from "@/lib/whatsapp/url";

const SIN_RESULTADOS: ClienteMostrador[] = [];

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/**
 * Cliente de la venta (spec §3.3): "Consumidor final" por defecto; se busca en el
 * servidor por nombre, documento, teléfono o placa, o se crea al vuelo con lo
 * mínimo (nombre, teléfono, documento). La tarjeta muestra lo que debe en el
 * mostrador, en ámbar, para decidir antes de dejarle más a crédito.
 */
export function SelectorCliente({
  cliente,
  onCambiar,
  inputRef,
}: {
  cliente: ClienteMostrador | null;
  onCambiar: (cliente: ClienteMostrador | null) => void;
  /** F2 enfoca este campo. */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  function aOpciones(resultados: ClienteMostrador[]): OpcionBuscador<ClienteMostrador>[] {
    return resultados.map((c) => ({
      clave: c.id,
      valor: c,
      contenido: (
        <>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{c.nombre}</span>{" "}
            <span className="text-muted-foreground">
              {[c.documento, c.telefono, c.placas.join(" ")].filter(Boolean).join(" · ")}
            </span>
          </span>
          {c.saldoMostrador > 0 ? (
            <span className="shrink-0 font-mono text-xs text-[oklch(0.55_0.15_60)]">
              Debe {formatoMoneda.format(c.saldoMostrador)}
            </span>
          ) : null}
        </>
      ),
    }));
  }

  const whatsapp = cliente ? urlWhatsapp(cliente.telefono, "Hola") : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border bg-muted/30 px-3 py-2" data-testid="cliente-actual">
        {cliente ? (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{cliente.nombre}</p>
              <p className="text-xs text-muted-foreground">
                {cliente.documento ? `Doc. ${cliente.documento}` : "Sin documento"}
                {cliente.telefono ? (
                  <>
                    {" · "}
                    {cliente.telefono}
                    {whatsapp ? (
                      <>
                        {" "}
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Escribir por WhatsApp"
                          className="inline-flex align-middle text-[oklch(0.5_0.12_150)]"
                        >
                          <MessageCircle className="size-3.5" aria-hidden />
                        </a>
                      </>
                    ) : null}
                  </>
                ) : null}
              </p>
              {cliente.saldoMostrador > 0 ? (
                <p className="text-xs font-medium text-[oklch(0.55_0.15_60)]">
                  Debe {formatoMoneda.format(cliente.saldoMostrador)} en el mostrador
                </p>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => onCambiar(null)}>
              <X className="size-3.5" aria-hidden />
              Quitar cliente
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Consumidor final</p>
        )}
      </div>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <BuscadorConceptos
            etiqueta="Buscar cliente"
            placeholder="Nombre, documento, teléfono o placa"
            buscar={buscarClientesMostradorAction}
            vacio={SIN_RESULTADOS}
            aOpciones={aOpciones}
            onSeleccionar={onCambiar}
            inputRef={inputRef}
          />
        </div>
        <Button type="button" variant="outline" className="h-10" onClick={() => setDialogoAbierto(true)}>
          <UserPlus className="size-4" aria-hidden />
          Nuevo cliente
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {cliente ? "Con cliente registrado puedes dejar saldo a crédito." : "Sin cliente, la venta tiene que quedar pagada."}
      </p>

      <DialogoClienteRapido
        abierto={dialogoAbierto}
        onCambiar={setDialogoAbierto}
        onCreado={(nuevo) => {
          setDialogoAbierto(false);
          onCambiar(nuevo);
        }}
      />
    </div>
  );
}

function DialogoClienteRapido({
  abierto,
  onCambiar,
  onCreado,
}: {
  abierto: boolean;
  onCambiar: (abierto: boolean) => void;
  onCreado: (cliente: ClienteMostrador) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const datos = new FormData(event.currentTarget);
    setGuardando(true);
    setError(null);
    try {
      const resultado = await createClienteAction({ error: null, success: false }, datos);
      if (resultado.success && resultado.cliente) {
        const { id, nombre, documento, telefono } = resultado.cliente;
        onCreado({ id, nombre, documento, telefono, placas: [], saldoMostrador: 0 });
      } else {
        setError(resultado.error ?? "No se pudo crear el cliente");
      }
    } catch {
      setError("No se pudo crear el cliente. Intenta de nuevo");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) setError(null);
        onCambiar(valor);
      }}
    >
      <DialogContent>
        <form onSubmit={guardar} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Crear cliente rápido</DialogTitle>
            <DialogDescription>Lo demás (correo, vehículos) se completa después en Clientes.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="cliente-rapido-nombre">Nombre</Label>
            <Input id="cliente-rapido-nombre" name="nombre" autoComplete="off" autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cliente-rapido-telefono">Teléfono</Label>
            <Input id="cliente-rapido-telefono" name="telefono" type="tel" autoComplete="off" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cliente-rapido-documento">Documento</Label>
            <Input id="cliente-rapido-documento" name="documento" autoComplete="off" />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onCambiar(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              Crear y usar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
