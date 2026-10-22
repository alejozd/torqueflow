export interface Azar {
  azar: () => number;
  entero: (min: number, max: number) => number;
  elegir: <T>(lista: readonly T[]) => T;
  probabilidad: (p: number) => boolean;
}

export function crearAzar(semilla: number): Azar {
  let estado = semilla;
  const azar = () => (estado = (estado * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  return {
    azar,
    entero: (min, max) => min + Math.floor(azar() * (max - min + 1)),
    elegir: <T>(lista: readonly T[]) => lista[Math.floor(azar() * lista.length)],
    probabilidad: (p) => azar() < p,
  };
}

const NOMBRES = [
  "Juan", "Carlos", "Andrés", "Luis", "Jorge", "Camilo", "Felipe", "Sebastián", "Daniel", "Santiago",
  "Mauricio", "Hernán", "Fabián", "Óscar", "Diego", "Wilson", "Édgar", "Julián", "Nicolás", "Ricardo",
  "María", "Luisa", "Paola", "Andrea", "Carolina", "Diana", "Natalia", "Claudia", "Liliana", "Sandra",
  "Viviana", "Yurany", "Katherine", "Johana", "Marcela", "Luz", "Gloria", "Ángela", "Lorena", "Tatiana",
] as const;

const APELLIDOS = [
  "Gómez", "Rodríguez", "Martínez", "López", "García", "Hernández", "Ramírez", "Torres", "Díaz", "Vargas",
  "Castro", "Rojas", "Moreno", "Jiménez", "Ortiz", "Gutiérrez", "Muñoz", "Álvarez", "Romero", "Suárez",
  "Valencia", "Ríos", "Cardona", "Osorio", "Arias", "Mejía", "Restrepo", "Cárdenas", "Peña", "Núñez",
  "Quintero", "Salazar", "Bedoya", "Patiño", "Herrera", "Pineda", "Duque", "Zapata",
] as const;

export function nombrePersona(az: Azar): { nombres: string; apellidos: string } {
  const nombres = az.probabilidad(0.4) ? `${az.elegir(NOMBRES)} ${az.elegir(NOMBRES)}` : az.elegir(NOMBRES);
  return { nombres, apellidos: `${az.elegir(APELLIDOS)} ${az.elegir(APELLIDOS)}` };
}

/** Cédula de 8 a 10 dígitos, sin ceros a la izquierda. */
export function cedula(az: Azar): string {
  const largo = az.entero(8, 10);
  let s = String(az.entero(1, 9));
  while (s.length < largo) s += String(az.entero(0, 9));
  return s;
}

/** Celular colombiano "3XX XXX XXXX". */
export function celular(az: Azar): string {
  const bloque = (n: number) => Array.from({ length: n }, () => az.entero(0, 9)).join("");
  return `3${az.entero(0, 2)}${az.entero(0, 9)} ${bloque(3)} ${bloque(4)}`;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function correo(nombres: string, apellidos: string, az: Azar): string {
  const nombre = sinTildes(nombres.split(" ")[0]).replace(/[^a-z0-9]/g, "");
  const apellido = sinTildes(apellidos.split(" ")[0]).replace(/[^a-z0-9]/g, "");
  const nn = String(az.entero(10, 99));
  return `${nombre}.${apellido}.${nn}@ejemplo.test`;
}

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function placa(az: Azar, ocupadas: ReadonlySet<string>): string {
  for (;;) {
    const letras = Array.from({ length: 3 }, () => LETRAS[az.entero(0, 25)]).join("");
    const candidata = `${letras}${String(az.entero(0, 999)).padStart(3, "0")}`;
    if (!ocupadas.has(candidata)) return candidata;
  }
}
