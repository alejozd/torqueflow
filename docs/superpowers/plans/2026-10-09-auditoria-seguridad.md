# Auditoría de seguridad — Plan de remediación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los 6 hallazgos de la auditoría de seguridad del 2026-10-09, una fase por hallazgo, en orden de severidad.

**Architecture:** Cada fase es independiente y deja el sistema funcionando. Las correcciones viven en el punto de control que ya existe (callback `jwt`, `authorize`, `requireSuperAdmin`, `next.config.ts`) en lugar de añadir capas nuevas. Mientras se pueda, cada tarea sigue TDD con vitest.

**Tech Stack:** Next.js 16 (App Router, server actions), next-auth v5 beta (JWT), Prisma 6 (multi-schema), vitest.

**Spec:** El informe de la auditoría (conversación del 2026-10-09). Hallazgos:
1. `src/auth.ts` acepta `sedeActivaId` sin validar en `trigger === "update"` → cambio a una sede no asignada.
2. Sin límite de intentos en `/login` ni en `/superadmin/login`.
3. Sin cabeceras HTTP de seguridad.
4. `requireSuperAdmin` no vuelve a validar que el superadmin exista.
5. `npm audit`: 9 vulnerabilidades altas en tooling; `shadcn` está en `dependencies`.
6. `DROP SCHEMA` con `$executeRawUnsafe` sin revalidar `schemaName` en ese punto.

## Global Constraints

- Commits: `fase-seg{N}-task {X}: descripción breve`, con commit y push a `main` al terminar cada tarea (RULES.md §3).
- `npx tsc --noEmit` y `npm test` solo al final de cada tarea (RULES.md §4).
- Nunca reintentar automáticamente un comando que falla: un intento de corrección como máximo y luego reportar (RULES.md §1).
- Los fallos de login siguen siendo indistinguibles: mismo `null` y mismo costo bcrypt (`compararConHashDeRelleno`).
- No tocar backlog de fases anteriores (RULES.md §7).

---

## Fase 1 (seg1) — Validar la sede en `update()` de la sesión

**Por qué:** `POST /api/auth/session` (con un CSRF token que cualquier usuario autenticado obtiene) llega al callback `jwt` con `trigger: "update"` y `session = body.data` controlado por el cliente. Hoy `token.sedeActivaId` se sobrescribe sin comprobar nada, así que un TECNICO/RECEPCION puede ponerse cualquier sede del taller. La validación correcta ya existe en `resolveSedeActiva`.

### Task 1: Revalidar la sede en el callback `jwt`

**Files:**
- Modify: `src/auth.ts:26-43` (callback `jwt`)
- Test: `src/auth.test.ts`

**Interfaces:**
- Consumes: `resolveSedeActiva(tenantDb, usuarioId, role, sedeId): Promise<{id, nombre} | null>` de `src/lib/auth/sede-access.ts`; `getTenantDb(schemaName)` de `src/lib/db/tenant-client.ts`.
- Produces: el callback `jwt` es `async` y, en `trigger === "update"`, solo cambia `sedeActivaId`/`sedeActivaNombre` cuando `resolveSedeActiva` devuelve una sede. El nombre sale de la BD, nunca del cliente.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/auth.test.ts`, añadir los mocks junto a los existentes:

```ts
const resolveSedeActivaMock = vi.hoisted(() => vi.fn());
const tenantDbFake = vi.hoisted(() => ({}));

vi.mock("@/lib/auth/sede-access", () => ({ resolveSedeActiva: resolveSedeActivaMock }));
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: vi.fn(() => tenantDbFake) }));
```

Reemplazar el test `"merges sedeActivaId/sedeActivaNombre from an update({ user }) call"` por:

```ts
  it("re-validates an update({ user }) sede against the DB and takes the nombre from it", async () => {
    resolveSedeActivaMock.mockResolvedValueOnce({ id: "sede-2", nombre: "Sede Norte (BD)" });

    const token = await config().callbacks.jwt({
      token: { sub: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "", sedeActivaNombre: "" },
      user: undefined,
      trigger: "update",
      session: { user: { sedeActivaId: "sede-2", sedeActivaNombre: "nombre del cliente" } },
    });

    expect(resolveSedeActivaMock).toHaveBeenCalledWith(tenantDbFake, "u1", "TECNICO", "sede-2");
    expect(token.sedeActivaId).toBe("sede-2");
    expect(token.sedeActivaNombre).toBe("Sede Norte (BD)");
  });

  it("rejects an update() to a sede the user may not use (forged POST /api/auth/session)", async () => {
    resolveSedeActivaMock.mockResolvedValueOnce(null);

    const token = await config().callbacks.jwt({
      token: { sub: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1", sedeActivaNombre: "Sede principal" },
      user: undefined,
      trigger: "update",
      session: { user: { sedeActivaId: "sede-ajena", sedeActivaNombre: "X" } },
    });

    expect(token.sedeActivaId).toBe("sede-1");
    expect(token.sedeActivaNombre).toBe("Sede principal");
  });

  it("ignores a non-string sedeActivaId in update() without querying the DB", async () => {
    resolveSedeActivaMock.mockClear();

    const token = await config().callbacks.jwt({
      token: { sub: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1", sedeActivaNombre: "Sede principal" },
      user: undefined,
      trigger: "update",
      session: { user: { sedeActivaId: { not: "a string" } } },
    });

    expect(resolveSedeActivaMock).not.toHaveBeenCalled();
    expect(token.sedeActivaId).toBe("sede-1");
  });
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `npx vitest run src/auth.test.ts`
Expected: FAIL. El test de rechazo encuentra `"sede-ajena"` y el de nombre encuentra `"nombre del cliente"`.

- [ ] **Step 3: Implementación mínima**

En `src/auth.ts`, importar:

```ts
import { resolveSedeActiva } from "@/lib/auth/sede-access";
import { getTenantDb } from "@/lib/db/tenant-client";
```

y reemplazar el bloque `if (trigger === "update" ...)` por:

```ts
      // `session` is whatever reached update() -- including a hand-crafted
      // POST /api/auth/session from the browser, not only
      // seleccionarSedeAction. So the requested sede is re-validated here,
      // and the nombre comes from the DB, never from the client.
      const sedeSolicitada = trigger === "update" ? session?.user?.sedeActivaId : undefined;
      if (typeof sedeSolicitada === "string" && sedeSolicitada) {
        const sedeActiva = await resolveSedeActiva(
          getTenantDb(token.tenantSchema as string),
          token.sub as string,
          token.role as "ADMIN" | "TECNICO" | "RECEPCION",
          sedeSolicitada,
        );
        if (sedeActiva) {
          token.sedeActivaId = sedeActiva.id;
          token.sedeActivaNombre = sedeActiva.nombre;
        }
      }
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/auth.test.ts src/app/actions` y luego `npx tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 5: Commit y push**

```bash
git add src/auth.ts src/auth.test.ts
git commit -m "fase-seg1-task 1: revalidar la sede en update() de la sesión"
git push origin main
```

---

## Fase 2 (seg2) — Límite de intentos de login

**Diseño:** limitador en memoria (la app corre como un único proceso PM2; si algún día escala a varios procesos, esto pasa a Redis/BD). Dos claves por intento: `email|ip` (5 fallos / 15 min) e `ip` (30 fallos / 15 min). Bloquear solo por email permitiría que un atacante deje fuera a un usuario legítimo; por eso la clave incluye la IP. Un intento bloqueado devuelve `null` y paga el hash de relleno, así que es indistinguible de una contraseña incorrecta.

### Task 1: Módulo `limitador-intentos`

**Files:**
- Create: `src/lib/auth/limitador-intentos.ts`
- Test: `src/lib/auth/limitador-intentos.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LimitadorIntentos {
    estaBloqueado(clave: string, ahora?: number): boolean;
    registrarFallo(clave: string, ahora?: number): void;
    limpiar(clave: string): void;
  }
  export function crearLimitadorIntentos(opts: { maxFallos: number; ventanaMs: number; maxClaves?: number }): LimitadorIntentos;
  export function claveIp(request: Request | undefined): string; // primer valor de x-forwarded-for, o "desconocida"
  ```

- [ ] **Step 1: Tests que fallan**

```ts
import { describe, expect, it } from "vitest";
import { claveIp, crearLimitadorIntentos } from "./limitador-intentos";

describe("crearLimitadorIntentos", () => {
  it("bloquea al llegar a maxFallos dentro de la ventana", () => {
    const l = crearLimitadorIntentos({ maxFallos: 3, ventanaMs: 1000 });
    for (let i = 0; i < 3; i++) l.registrarFallo("a", 0);
    expect(l.estaBloqueado("a", 10)).toBe(true);
    expect(l.estaBloqueado("b", 10)).toBe(false);
  });

  it("desbloquea cuando la ventana expira", () => {
    const l = crearLimitadorIntentos({ maxFallos: 1, ventanaMs: 1000 });
    l.registrarFallo("a", 0);
    expect(l.estaBloqueado("a", 1001)).toBe(false);
  });

  it("limpiar() reinicia el contador tras un login correcto", () => {
    const l = crearLimitadorIntentos({ maxFallos: 2, ventanaMs: 1000 });
    l.registrarFallo("a", 0);
    l.limpiar("a");
    l.registrarFallo("a", 1);
    expect(l.estaBloqueado("a", 2)).toBe(false);
  });

  it("no crece sin límite: descarta la clave más antigua al pasar maxClaves", () => {
    const l = crearLimitadorIntentos({ maxFallos: 1, ventanaMs: 1000, maxClaves: 2 });
    l.registrarFallo("a", 0);
    l.registrarFallo("b", 0);
    l.registrarFallo("c", 0);
    expect(l.estaBloqueado("a", 1)).toBe(false);
    expect(l.estaBloqueado("c", 1)).toBe(true);
  });
});

describe("claveIp", () => {
  it("toma el primer valor de x-forwarded-for", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
    expect(claveIp(req)).toBe("1.2.3.4");
  });
  it("devuelve 'desconocida' sin cabecera o sin request", () => {
    expect(claveIp(new Request("http://x"))).toBe("desconocida");
    expect(claveIp(undefined)).toBe("desconocida");
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/auth/limitador-intentos.test.ts` → FAIL (el módulo no existe).

- [ ] **Step 3: Implementación**

```ts
export interface LimitadorIntentos {
  estaBloqueado(clave: string, ahora?: number): boolean;
  registrarFallo(clave: string, ahora?: number): void;
  limpiar(clave: string): void;
}

interface Registro { fallos: number; inicio: number }

/**
 * In-memory, fixed-window failure counter. Valid only because the app runs
 * as a single PM2 process; with more processes this must move to shared
 * storage. `maxClaves` bounds memory against an attacker rotating keys.
 */
export function crearLimitadorIntentos({
  maxFallos,
  ventanaMs,
  maxClaves = 10_000,
}: { maxFallos: number; ventanaMs: number; maxClaves?: number }): LimitadorIntentos {
  const registros = new Map<string, Registro>();

  function vigente(clave: string, ahora: number): Registro | undefined {
    const r = registros.get(clave);
    if (r && ahora - r.inicio > ventanaMs) {
      registros.delete(clave);
      return undefined;
    }
    return r;
  }

  return {
    estaBloqueado(clave, ahora = Date.now()) {
      return (vigente(clave, ahora)?.fallos ?? 0) >= maxFallos;
    },
    registrarFallo(clave, ahora = Date.now()) {
      const r = vigente(clave, ahora);
      if (r) {
        r.fallos += 1;
        return;
      }
      if (registros.size >= maxClaves) {
        const masAntigua = registros.keys().next().value;
        if (masAntigua !== undefined) registros.delete(masAntigua);
      }
      registros.set(clave, { fallos: 1, inicio: ahora });
    },
    limpiar(clave) {
      registros.delete(clave);
    },
  };
}

export function claveIp(request: Request | undefined): string {
  const xff = request?.headers.get("x-forwarded-for");
  const primera = xff?.split(",")[0]?.trim();
  return primera || "desconocida";
}
```

- [ ] **Step 4:** test PASS + `npx tsc --noEmit`.
- [ ] **Step 5:** commit `fase-seg2-task 1: limitador de intentos en memoria` y push.

### Task 2: Aplicar el limitador al login de taller

**Files:**
- Modify: `src/lib/auth/authorize-credentials.ts` (nuevo parámetro `request?: Request`)
- Modify: `src/auth.ts` (`authorize(credentials, request)` → `authorizeCredentials(credentials, request)`)
- Test: `src/lib/auth/authorize-credentials.test.ts`

**Interfaces:**
- Consumes: `crearLimitadorIntentos`, `claveIp` (Task 1).
- Produces: `authorizeCredentials(credentials, request?)` y `limitadorLoginTaller` exportado para que los tests lo reinicien.

- [ ] **Step 1: Tests que fallan** (añadir a `authorize-credentials.test.ts`, reutilizando sus mocks):
  - Tras 5 llamadas con contraseña incorrecta para `a@x.com` desde IP `1.2.3.4`, la 6.ª con la contraseña **correcta** devuelve `null` y llama a `compararConHashDeRelleno`.
  - La misma cuenta desde la IP `5.6.7.8` sí puede entrar (no hay bloqueo cruzado).
  - Un login correcto limpia el contador de `email|ip`.
  - El email se normaliza con `trim().toLowerCase()` **solo para la clave** del limitador.
  - En `beforeEach`: reiniciar los limitadores; exportar desde el módulo `reiniciarLimitadoresParaTests()`, que los vuelve a crear.

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementación.** Al inicio de `authorizeCredentials`, después del chequeo de tipos:
  ```ts
  const ip = claveIp(request);
  const claveCuenta = `${email.trim().toLowerCase()}|${ip}`;
  if (limitadorCuenta.estaBloqueado(claveCuenta) || limitadorIp.estaBloqueado(ip)) {
    await compararConHashDeRelleno(password);
    return null;
  }
  ```
  En cada `return null` de fallo, llamar antes a `registrarFallo(claveCuenta)` y `registrarFallo(ip)`; lo más limpio es envolver la lógica actual en `autorizar()` y hacer el registro en un solo punto. En el éxito, `limitadorCuenta.limpiar(claveCuenta)`. Valores: `limitadorCuenta = crearLimitadorIntentos({ maxFallos: 5, ventanaMs: 15 * 60_000 })` y `limitadorIp = crearLimitadorIntentos({ maxFallos: 30, ventanaMs: 15 * 60_000 })`.
- [ ] **Step 4:** tests + tsc PASS.
- [ ] **Step 5:** commit `fase-seg2-task 2: límite de intentos en el login de taller` y push.

### Task 3: Aplicar el limitador al login de superadmin

**Files:**
- Modify: `src/lib/super-admin/auth.ts` (`authorize(credentials, request)`)
- Modify: `src/lib/super-admin/verify-credentials.ts` (o un wrapper `authorizeSuperAdmin` nuevo en el mismo archivo, más fácil de testear)
- Test: `src/lib/super-admin/verify-credentials.test.ts`

- [ ] **Step 1:** los mismos 4 casos de la Task 2, pero con límites más estrictos: `maxFallos: 3` por `email|ip` y `10` por IP, ventana de 15 min. Instancias **separadas** de las del taller.
- [ ] **Step 2–4:** FAIL → implementar con el mismo patrón → PASS + tsc.
- [ ] **Step 5:** commit `fase-seg2-task 3: límite de intentos en el login de superadmin` y push.

**Verificación manual (usuario):** en el servidor, comprobar que nginx o el proxy envían `X-Forwarded-For`. Si no lo envían, todas las peticiones caen en la clave `"desconocida"` y el límite por IP se vuelve global.

---

## Fase 3 (seg3) — Cabeceras HTTP de seguridad

### Task 1: `headers()` en `next.config.ts`

**Files:**
- Modify: `next.config.ts`
- Create: `next.config.test.ts`

Antes de empezar, leer `node_modules/next/dist/docs/` (la sección de `headers` en next.config), según AGENTS.md.

- [ ] **Step 1: Test que falla**
  ```ts
  import { describe, expect, it } from "vitest";
  import config from "./next.config";

  describe("security headers", () => {
    it("aplica las cabeceras de seguridad a todas las rutas", async () => {
      const reglas = await config.headers!();
      const global = reglas.find((r) => r.source === "/:path*");
      const mapa = Object.fromEntries(global!.headers.map((h) => [h.key, h.value]));
      expect(mapa["X-Frame-Options"]).toBe("DENY");
      expect(mapa["X-Content-Type-Options"]).toBe("nosniff");
      expect(mapa["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(mapa["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
      expect(mapa["Permissions-Policy"]).toBe("camera=(self), microphone=(), geolocation=()");
      expect(mapa["Content-Security-Policy"]).toBe(
        "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
      );
    });
  });
  ```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** añadir `async headers() { return [{ source: "/:path*", headers: [...] }] }` con esos valores exactos. `camera=(self)` mantiene la captura de fotos del DVI. La CSP es deliberadamente mínima (sin `script-src`): una CSP con nonces para los scripts inline de Next es un cambio aparte y no entra en esta fase.
- [ ] **Step 4:** test + tsc PASS; `npm run build` para comprobar que la config carga.
- [ ] **Step 5:** commit `fase-seg3-task 1: cabeceras HTTP de seguridad` y push.

**Verificación manual (usuario):** tras el deploy, `curl -sI https://torqueflow.zdevs.uk/login` debe mostrar las seis cabeceras. Además, comprobar que la cámara del DVI sigue funcionando y que el envío a wa.me (que abre otra pestaña) no se rompe.

---

## Fase 4 (seg4) — Revalidar al superadmin en cada petición

### Task 1: `requireSuperAdmin` consulta la BD

**Files:**
- Modify: `src/lib/super-admin/guards.ts`
- Test: `src/lib/super-admin/guards.test.ts`

- [ ] **Step 1: Test que falla** (siguiendo los mocks existentes del archivo): con una sesión válida pero `publicDb.superAdmin.findUnique` devolviendo `null`, `requireSuperAdmin()` llama a `redirect("/superadmin/login")`. Con la fila presente, devuelve `{ id, email, nombre }` y `nombre` sale de la BD.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementación**
  ```ts
  const admin = await publicDb.superAdmin.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, nombre: true },
  });
  if (!admin) {
    redirect("/superadmin/login");
  }
  return { id: admin.id, email: admin.email, nombre: admin.nombre };
  ```
  Es la misma decisión que `requireSession`: una consulta extra por petición a cambio de que un superadmin borrado pierda el acceso de inmediato.
- [ ] **Step 4:** tests + tsc PASS.
- [ ] **Step 5:** commit `fase-seg4-task 1: revalidar el superadmin en cada petición` y push.

---

## Fase 5 (seg5) — Dependencias

### Task 1: Mover `shadcn` a `devDependencies`

`shadcn` solo se usa en build (`@import "shadcn/tailwind.css"` en `src/app/globals.css` y la CLI).

- [ ] **Step 1:** preguntar al usuario cómo se hace el deploy en `/var/www/torqueflow`. Si allí se ejecuta `npm ci --omit=dev` **antes** de `npm run build`, mover `shadcn` rompería el build: en ese caso **no** se mueve y la tarea se cierra documentando el motivo.
- [ ] **Step 2:** si el deploy instala devDependencies para el build: `npm uninstall shadcn && npm install -D shadcn@^4.19.0`.
- [ ] **Step 3:** `npm run build` en local → OK. `npm audit --omit=dev` → `shadcn`, `fast-glob`, `micromatch`, `braces`, `ts-morph` y `@ts-morph/common` desaparecen del reporte de producción.
- [ ] **Step 4:** commit `fase-seg5-task 1: shadcn como devDependency` y push.

### Task 2: Prisma / deepmerge-ts

`npm audit fix` propone *bajar* `prisma` a 6.12.0, lo cual no se aplica. La vulnerabilidad (stack exhaustion en `deepmerge-ts`) solo afecta a la CLI de `prisma` al cargar su config, no a `@prisma/client` en runtime.

- [ ] **Step 1:** `npm view prisma versions --json | tail -20` y `npm view deepmerge-ts version`. Si hay un `prisma` 6.x posterior a 6.19.3 que resuelva `deepmerge-ts >= 8`, actualizar `prisma` y `@prisma/client` a esa misma versión exacta, ejecutar `npx prisma generate` (ambos schemas) y `npm test`.
- [ ] **Step 2:** si no existe esa versión, añadir en `package.json` `"overrides": { "deepmerge-ts": "^8.0.0" }`, ejecutar `npm install`, `npx prisma generate` y `npm test`. Si cualquiera falla, revertir y documentar el riesgo como aceptado (solo afecta a tooling).
- [ ] **Step 3:** commit `fase-seg5-task 2: resolver deepmerge-ts en prisma` y push.

---

## Fase 6 (seg6) — Revalidar el identificador antes de SQL crudo

### Task 1: `assertSafeSchemaName` compartido

**Files:**
- Create: `src/lib/tenant/schema-name.ts`
- Test: `src/lib/tenant/schema-name.test.ts`
- Modify: `scripts/provision-tenant.ts` (usar el helper en lugar de `SAFE_IDENTIFIER` local)
- Modify: `src/app/actions/super-admin-actions.ts:112-115` (`rollbackTenantProvisioning`)

**Interfaces:**
- Produces: `export function assertSafeSchemaName(schemaName: string): void` (lanza `Error("Invalid schema name: ...")`, el mismo mensaje que hoy, así `ERRORES_PROVISIONAMIENTO_CONOCIDOS` sigue funcionando).

- [ ] **Step 1: Tests que fallan**
  ```ts
  import { describe, expect, it } from "vitest";
  import { assertSafeSchemaName } from "./schema-name";

  describe("assertSafeSchemaName", () => {
    it("acepta snake_case en minúsculas", () => {
      expect(() => assertSafeSchemaName("taller_perez")).not.toThrow();
    });
    it.each(['x"; DROP SCHEMA public; --', "Taller", "1taller", "taller-perez", ""])("rechaza %j", (nombre) => {
      expect(() => assertSafeSchemaName(nombre)).toThrow(/Invalid schema name/);
    });
  });
  ```
  Y en el test de `super-admin-actions`: si `rollbackTenantProvisioning` recibe un nombre inválido, **no** se llama a `$executeRawUnsafe`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementación**
  ```ts
  const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

  /** The only gate before a schema name is interpolated into raw DDL. */
  export function assertSafeSchemaName(schemaName: string): void {
    if (!SAFE_IDENTIFIER.test(schemaName)) {
      throw new Error(`Invalid schema name: "${schemaName}" (expected lowercase snake_case)`);
    }
  }
  ```
  En `rollbackTenantProvisioning`, antes del `DROP`: `try { assertSafeSchemaName(schemaName); } catch { return; }` (el rollback es best-effort y nunca debe ocultar el error original). En `provision-tenant.ts`, sustituir el `if (!SAFE_IDENTIFIER...)` por `assertSafeSchemaName(schemaName)`.
- [ ] **Step 4:** tests + tsc PASS.
- [ ] **Step 5:** commit `fase-seg6-task 1: revalidar schemaName antes de DDL crudo` y push.
