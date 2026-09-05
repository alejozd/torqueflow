# Diseño: gestión de tenants desde el panel de super-admin

## Contexto

Hoy `/superadmin` (`src/app/superadmin/page.tsx`) ya tiene autenticación real: `requireSuperAdmin()` (`src/lib/super-admin/guards.ts:15`) redirige a `/superadmin/login` si no hay sesión, y toda action que alimenta la página lo llama primero (`src/app/actions/super-admin-actions.ts`). Esto NO se toca en este cambio.

Lo que falta es exclusivamente gestión de tenants desde la UI en vez de CLI:

1. Mostrar quién está logueado y permitirle cerrar sesión.
2. Crear un tenant nuevo (hoy son dos comandos manuales: `npm run tenant:provision` + `npm run tenant:seed-user`).
3. Ver cuándo se creó cada tenant en la tabla.

**Fuera de alcance** (explícitamente diferido por el usuario): página de detalle de tenant ("Ver detalles"), y cualquier cambio a la infraestructura de auth existente (`src/lib/super-admin/auth.ts`, `guards.ts`, middleware, rutas de login).

## Orden de implementación (commits atómicos)

1. Migración: agregar `Tenant.nombre`.
2. UI de sesión activa (header).
3. Formulario de creación de tenant.
4. Columna "Fecha de creación" en la tabla.

---

## 1. Migración: `Tenant.nombre`

`prisma/schema.prisma:29` gana un campo nuevo:

```prisma
model Tenant {
  id         String            @id @default(cuid())
  slug       String            @unique
  nombre     String?
  schemaName String            @unique @map("schema_name")
  estado     EstadoTenant      @default(ACTIVO)
  planId     String            @map("plan_id")
  plan       Plan              @relation(fields: [planId], references: [id], onDelete: Restrict)
  userEmails TenantUserEmail[]
  createdAt  DateTime          @default(now()) @map("created_at")
  updatedAt  DateTime          @updatedAt @map("updated_at")

  @@map("tenants")
  @@index([planId])
}
```

`estado` sigue siendo el enum `EstadoTenant` existente — no se toca su tipo (el snippet ilustrativo que circuló con `estado String @default("activo")` no aplica; ese campo ya es un enum funcionando y no hay motivo para bajarlo a string).

`nombre` es **nullable**: los tenants ya provisionados no lo tienen, y no hay backfill posible (no existe un "nombre bonito" previo del que derivarlo — solo `slug`). El formulario de creación nuevo (§3) sí lo exige.

Este proyecto no usa `prisma migrate dev` para generar migraciones (ver migraciones existentes en `prisma/migrations/*/migration.sql`, todas escritas a mano). Se agrega `prisma/migrations/20260905000000_add_tenant_nombre/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "nombre" TEXT;
```

Se aplica con el mismo mecanismo que usan los tests y `provisionTenant` para el schema `tenant` (`npx prisma migrate deploy`), pero aquí contra el schema `public` (`npx prisma migrate deploy --schema=prisma/schema.prisma`, usando `DATABASE_URL`).

## 2. UI de sesión activa

`/superadmin` no tiene hoy ningún header — `src/app/superadmin/layout.tsx` es un client component que solo envuelve `SessionProvider` (basePath `/api/superadmin/auth`), y `page.tsx` renderiza el `<main>` directo.

El dashboard del tenant (`src/app/(dashboard)/layout.tsx:50-69`) ya resuelve este mismo problema: un `<header>` con iniciales + email a la izquierda y acciones (incluido `SignOutButton`, `src/app/(dashboard)/sign-out-button.tsx`) a la derecha. Se replica el mismo patrón visual, adaptado:

- `SuperAdminPage` (`src/app/superadmin/page.tsx`), que ya es un server component, llama directamente a `requireSuperAdmin()` (no solo indirectamente vía `listTenantsConPlan`/`listPlanes`) para obtener `{ email, nombre }` y renderizar el header.
- Nuevo `src/app/superadmin/sign-out-button.tsx` (client component), calcado de `sign-out-button.tsx` pero apuntando al login de super-admin:
  ```tsx
  onClick={() => signOut({ callbackUrl: `${window.location.origin}/superadmin/login` })}
  ```
  Al estar dentro del `SessionProvider` con `basePath="/api/superadmin/auth"` de `layout.tsx`, `signOut()` ya golpea la instancia de NextAuth correcta sin configuración adicional — mismo mecanismo que ya usa `superadmin-login-form.tsx` para `signIn()`.
- Layout del header: nombre + email a la izquierda (sin iniciales/avatar — no hay convención de avatar para super-admin, se omite en vez de inventar una), botón "Cerrar sesión" a la derecha. Un `<h1>Talleres</h1>` que ya existe pasa a compartir fila con este bloque.

## 3. Formulario de creación de tenant

### 3.1 Decisión de arquitectura: cómo provisionar el schema sin `execSync` en medio de un request

`provisionTenant()` (`scripts/provision-tenant.ts`) crea el schema Postgres y aplica las migraciones del tenant vía:
```ts
execSync("npx prisma migrate deploy --schema=prisma/tenant/schema.prisma", { env: {...}, stdio: "inherit" });
```
Esto funciona hoy porque corre como script de Node standalone (`tsx scripts/cli/provision-tenant.ts`) con el repo completo y `devDependencies` (incluye `prisma`, el CLI) instaladas.

`PROJECT_BRIEF.md:30` confirma que el hosting objetivo es **Docker Compose en un servidor Ubuntu propio** (no serverless) — el filesystem es persistente y un `execSync` de larga duración dentro de una server action no choca con un timeout de función tipo Vercel. Eso hace viable, en principio, invocar `provisionTenant()` tal cual desde una server action.

Sin embargo, hay un riesgo real que **no se resuelve en este documento** porque no hay `Dockerfile` todavía en el repo (`Glob` no encontró ninguno): si la imagen de producción se construye con `npm ci --omit=dev` (patrón típico para reducir tamaño de imagen), el paquete `prisma` — el CLI, hoy en `devDependencies` (`package.json:57`) — no estaría disponible en el contenedor en runtime, y `execSync("npx prisma migrate deploy ...")` fallaría con "command not found" la primera vez que alguien use el formulario en producción.

**Decisión para esta fase:** reusar `provisionTenant()` y `seedTenantUser()` tal cual, invocadas directamente desde la nueva server action (Opción A). Es la opción de menor esfuerzo, reusa código ya probado (`provision-tenant.test.ts`, `seed-tenant-user.test.ts`), y el `execSync` sigue siendo aceptable en un servidor Docker Compose persistente.

**Condición que hay que verificar antes de dar esto por cerrado en producción:** cuando se escriba el `Dockerfile` (fuera de alcance de este cambio), la imagen de producción debe incluir `prisma` como dependencia disponible en runtime (moverlo a `dependencies`, o instalar `devDependencies` en la imagen final). Si eso no se cumple, la alternativa (no implementada aquí, queda documentada como Opción B para una fase posterior) es reemplazar el `execSync` de `provisionTenant` por una aplicación programática de las migraciones del tenant: leer los `.sql` de `prisma/tenant/migrations/*/migration.sql` en orden y ejecutarlos con `$executeRawUnsafe` contra el schema nuevo, sin depender del CLI de Prisma en runtime. Esto evita el child process pero pierde el tracking de `_prisma_migrations` que mantiene `migrate deploy`, así que no es un cambio trivial — por eso se deja fuera de este alcance en vez de improvisarlo ahora.

### 3.2 Server action: `crearTenantAction`

Se agrega a `src/app/actions/super-admin-actions.ts` (el archivo real donde ya viven `cambiarEstadoTenantAction`/`cambiarPlanTenantAction`) — no a `src/actions/superadmin-actions.ts` como se mencionó en la conversación; esa ruta no existe y rompería la convención del proyecto (`src/app/actions/*.ts`, un archivo por dominio, todas las super-admin actions juntas en este mismo archivo).

```ts
export interface CrearTenantResult {
  error: string | null;
  credenciales: { email: string; password: string } | null;
}

export async function crearTenantAction(
  prevState: CrearTenantResult,
  formData: FormData,
): Promise<CrearTenantResult>
```

Flujo:
1. `requireSuperAdmin()` primero, como toda action de este archivo.
2. Leer y validar `formData`: `nombre`, `slug`, `planId`, `adminEmail`, `adminNombre`. Slug: mismo formato que `isValidTenantSlug` (`src/lib/tenant/subdomain.ts`) ya valida — el error de formato se ve reflejado en `error`, no hace falta duplicar la regex, `provisionTenant` ya la aplica y lanza si es inválida.
3. `schemaName` se deriva del slug igual que hace `scripts/cli/provision-tenant.ts:9`: `slug.replace(/-/g, "_")`.
4. Generar password: `randomBytes(9).toString("base64url")` → exactamente 12 caracteres, alfabeto seguro (`A-Za-z0-9-_`). Reusa el mismo primitivo (`node:crypto` `randomBytes`) que ya usa `src/lib/crypto/secret-box.ts` — sin librería nueva. Cumple de sobra el mínimo de 8 caracteres que exige `src/lib/validation/usuario.ts:8` (no hay regla de complejidad adicional en el proyecto, así que no se inventa una acá).
5. Llamar `provisionTenant({ slug, schemaName, planId, nombre })`. Esto requiere extender `ProvisionTenantInput` (`scripts/provision-tenant.ts:7`) con dos campos opcionales, `planId?: string` y `nombre?: string`, para no romper `scripts/cli/provision-tenant.ts` (que sigue llamando sin ninguno de los dos):
   - `planId`: si viene, se usa en el `publicDb.tenant.create` en vez de resolver "Básico" a mano (línea 45 de `provision-tenant.ts` hoy); si no viene, se mantiene el comportamiento actual (`planBasico.id` por defecto).
   - `nombre`: si viene, se guarda en el mismo `create` (un solo write, sin `update` posterior).
6. Llamar `seedTenantUser({ schemaName, email: adminEmail, password, nombre: adminNombre })`.
7. **Si el paso 6 falla:** el tenant ya quedó creado (schema + fila + sede + bodega) pero sin usuario admin — un tenant huérfano e inaccesible. Igual que `provisionTenant` limpia su propio schema si `sede.create` falla (`scripts/provision-tenant.ts:48-55`), la action debe limpiar aquí: `publicDb.tenant.delete({ where: { id: tenant.id } })` + `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`, y devolver el error. (Nota para implementación: si se prefiere no duplicar esta lógica de limpieza, es candidato a extraerse a un helper compartido con `provisionTenant`, pero eso es una decisión de la fase de implementación, no de este diseño.)
8. Éxito: `revalidatePath("/superadmin")` y devolver `{ error: null, credenciales: { email: adminEmail, password } }`. La password **no se persiste en ningún estado del servidor más allá del valor de retorno de esta llamada** — no se loguea, no se guarda en ninguna tabla en texto plano (ya se guarda hasheada vía `seedTenantUser`).

### 3.3 UI del formulario

Nuevo componente cliente `src/app/superadmin/crear-tenant-form.tsx`, montado arriba de la tabla en `page.tsx` (dentro de su propio `Card`, mismo patrón que el `Card` de "Listado").

Campos:
- **Nombre del tenant** (texto, requerido) — ej. "Taller Familiar Gómez".
- **Slug** (texto, requerido) — autogenerado desde "Nombre" con una función `slugify` local (minúsculas, sin diacríticos, espacios → guiones, solo `[a-z0-9-]`), pero editable: el usuario puede escribir a mano después de que se autogeneró, y a partir de ahí deja de regenerarse automáticamente (mismo patrón de "campo derivado pero editable" que ya se usa para precio unitario en `agregar-item-form.tsx`, vía `onChange` + una bandera de "tocado manualmente").
- **Plan** (`SelectField`, dropdown) — reusa `listPlanes()` ya existente, se le pasa como prop igual que hace `TenantRowActions` hoy.
- **Email del admin** (email, requerido).
- **Nombre del admin** (texto, requerido).
- Botón "Crear cliente" (`useActionState` + `crearTenantAction`, mismo patrón que `TenantRowActions`).

Al recibir `credenciales` en el estado de la action (éxito), se abre un `Dialog` (`components/ui/dialog.tsx`, ya usado en el proyecto vía `@base-ui/react/dialog`) con:
- "✅ Cliente creado exitosamente"
- Email y password en texto seleccionable (`<code>` o input `readOnly`)
- "⚠️ Copia esta contraseña ahora. No se mostrará de nuevo."
- Botón "Copiar" → `navigator.clipboard.writeText(password)` (no hay patrón previo de copiar-al-portapapeles en el proyecto; se introduce aquí, acotado a este botón).
- Botón "Cerrar" → cierra el diálogo y limpia el formulario (nuevo `nombre`/`slug`/emails vacíos para cargar el siguiente cliente).

El modal es la única vía para ver la password — cerrarlo sin copiarla la pierde, que es la garantía de "se muestra una sola vez" (no se guarda en ningún estado de React que sobreviva al unmount, ni en la URL, ni en logs de servidor).

## 4. Columna "Fecha de creación"

`Tenant.createdAt` ya existe (`prisma/schema.prisma:37`) y ya viaja en `TenantConPlan` (el `include` de `listTenantsConPlan` no lo excluye). No requiere cambios en la action.

En `src/app/superadmin/page.tsx`, nueva columna en `columns` después de "Plan":
```ts
{
  header: "Fecha de creación",
  cell: (tenant) => formatoFecha.format(tenant.createdAt),
}
```
usando `new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" })` a nivel de módulo — mismo patrón exacto que `src/app/(dashboard)/vehiculos/[id]/page.tsx:44`. No se introduce una librería de fecha relativa ("hace X días"): no existe ninguna en el proyecto hoy (se buscó explícitamente) y agregarla para una sola columna de un panel de bajo tráfico no se justifica.

La columna "Taller" (línea 23 de `page.tsx` hoy) cambia de `tenant.slug` a `tenant.nombre ?? tenant.slug`, para que los tenants creados desde el formulario nuevo muestren su nombre amigable y los preexistentes (sin `nombre`) sigan mostrando el slug como antes.

## Manejo de errores

- Slug duplicado o formato inválido, schema ya existe: `provisionTenant` ya lanza con mensajes específicos (`"Tenant already exists..."`, `"Invalid slug..."`) — la action los captura en un `try/catch` y los vuelca a `error` del estado, igual que ya hacen `cambiarEstadoTenantAction`/`cambiarPlanTenantAction` con sus propias validaciones.
- Email de admin duplicado (choca con `TenantUserEmail` global): `seedTenantUser` → `claimTenantUserEmail` lanza `TenantUserEmailConflictError` (`src/lib/tenant/tenant-user-email.ts:3`) si el email ya está tomado por otro tenant — se captura igual, dispara la limpieza del §3.2 punto 8, y el mensaje al usuario indica que ese email ya pertenece a otro cliente.
- Falla de `execSync` (migración del tenant): se propaga como error genérico; no hay forma de dar un mensaje específico sin parsear stderr de Prisma, así que se muestra "No se pudo crear el tenant, contactá soporte" y se loguea el error completo en el servidor (`console.error`), igual que hoy hacen los catch de los scripts CLI.

## Testing (Strict TDD Mode)

- `super-admin-actions.test.ts`: casos nuevos para `crearTenantAction` — éxito (crea tenant + usuario + retorna password), `requireSuperAdmin` rechazado (no debe tocar la DB, mismo patrón que los tests existentes de este archivo), slug duplicado, email de admin duplicado (con verificación de que el tenant creado se limpia), y que la password generada tiene 12 caracteres.
- `provision-tenant.test.ts`: caso nuevo para el `planId` opcional agregado a `ProvisionTenantInput` (usa el plan indicado en vez de "Básico" por defecto) y para que `nombre` se persista si se pasa.
- `crear-tenant-form.test.tsx` (nuevo): el slug se autogenera desde el nombre hasta que el usuario lo edita a mano; el modal de credenciales aparece tras un submit exitoso y no antes; el botón "Copiar" invoca `navigator.clipboard.writeText` con la password recibida.
- `sign-out-button.test.tsx` (superadmin, nuevo): click invoca `signOut` con el `callbackUrl` de `/superadmin/login`.
- `page.tsx` (superadmin): snapshot/render test de que la columna "Taller" usa `nombre ?? slug` y que "Fecha de creación" formatea con el mismo `Intl.DateTimeFormat` que el resto del proyecto.
