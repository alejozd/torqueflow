/**
 * Edad y cuenta regresiva al cumpleaños a partir de cadenas "aaaa-mm-dd"
 * (la fecha de nacimiento es @db.Date: usar toISOString().slice(0, 10), nunca
 * formatoDiaBogota). `hoy` es el día en Bogotá. Quien nació un 29 de febrero
 * cumple el 28 en los años no bisiestos.
 */
export interface InfoCumpleanos {
  edad: number;
  diasParaCumple: number;
  cumpleHoy: boolean;
}

const MS_DIA = 86_400_000;

const esBisiesto = (anio: number) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;

function cumpleEnAnio(mes: number, dia: number, anio: number): number {
  const diaReal = mes === 2 && dia === 29 && !esBisiesto(anio) ? 28 : dia;
  return Date.UTC(anio, mes - 1, diaReal);
}

export function infoCumpleanos(nacimiento: string, hoy: string): InfoCumpleanos {
  const [anioN, mesN, diaN] = nacimiento.split("-").map(Number);
  const [anioH, mesH, diaH] = hoy.split("-").map(Number);
  const hoyMs = Date.UTC(anioH, mesH - 1, diaH);

  let proximo = cumpleEnAnio(mesN, diaN, anioH);
  let anioProximo = anioH;
  if (proximo < hoyMs) {
    anioProximo = anioH + 1;
    proximo = cumpleEnAnio(mesN, diaN, anioProximo);
  }
  const diasParaCumple = Math.round((proximo - hoyMs) / MS_DIA);
  const cumpleHoy = diasParaCumple === 0;
  const edad = anioProximo - anioN - (cumpleHoy ? 0 : 1);
  return { edad, diasParaCumple, cumpleHoy };
}

export function textoCumpleanos({ edad, diasParaCumple, cumpleHoy }: InfoCumpleanos): string {
  const anios = edad === 1 ? "1 año" : `${edad} años`;
  if (cumpleHoy) return `¡Cumple ${anios} hoy!`;
  if (diasParaCumple === 1) return `${anios} · cumple mañana`;
  return `${anios} · cumple en ${diasParaCumple} días`;
}
