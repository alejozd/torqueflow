type EventoTecla = {
  key: string;
  nativeEvent: { isComposing: boolean; keyCode: number };
};

/**
 * Enter que de verdad confirma el campo. Con teclados que arman la palabra antes
 * de escribirla (chino, japonés, algunos de Android) el primer Enter solo
 * confirma la palabra: llega con `isComposing` o, en Safari, con keyCode 229.
 */
export function esEnterConfirmado(evento: EventoTecla): boolean {
  if (evento.key !== "Enter") return false;
  return !evento.nativeEvent.isComposing && evento.nativeEvent.keyCode !== 229;
}
