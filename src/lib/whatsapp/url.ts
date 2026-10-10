/**
 * wa.me wants the number in international format, digits only. A 10-digit
 * number is a Colombian mobile without country code (the app is Colombia-only,
 * same rule as the cotización WhatsApp send); anything else is assumed to
 * already carry one. Null when there is no usable number.
 */
export function urlWhatsapp(telefono: string | null, texto: string): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (digitos.length < 7) return null;
  const numero = digitos.length === 10 ? `57${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
