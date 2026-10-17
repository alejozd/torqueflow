import { z } from "zod";
import { esPermiso, PERMISOS_SOLO_ADMIN, type Permiso } from "@/lib/auth/permisos";

export const MENSAJE_PERMISO_NO_ASIGNABLE = "Ese permiso no se puede dar a este usuario";

/** Lista de permisos marcados en pantalla: sin claves desconocidas ni permisos solo de administrador (D2/D3). */
export const permisosMarcadosSchema = z.array(
  z.string().refine(
    (valor): valor is Permiso => esPermiso(valor) && !PERMISOS_SOLO_ADMIN.includes(valor),
    MENSAJE_PERMISO_NO_ASIGNABLE,
  ),
);
