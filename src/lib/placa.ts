const PLACA_CON_GUION = /^([A-Za-z]{3})(\d{3})$/;

/** "xyz789" -> "XYZ-789". Only the common 3-letter+3-digit shape gets a dash; anything else is just uppercased. */
export function formatoPlaca(placa: string): string {
  const match = placa.match(PLACA_CON_GUION);
  return match ? `${match[1]}-${match[2]}`.toUpperCase() : placa.toUpperCase();
}
