# Diseño: módulo de auditoría (AuditLog)

## Contexto

Hoy no existe ningún registro general de "quién hizo qué" en la app. Lo más cercano es `HistorialVehiculo` (bitácora de eventos de un vehículo, con `autor` nullable vía `SetNull`) y `NotificacionOrdenEnviada` (log best-effort de envíos de email desde `orden-actions.ts`), pero ninguno cubre acciones sensibles a nivel de usuario, tenant o entidades operativas.

Objetivo: cubrir tres necesidades con un solo sistema:
1. **Trazabilidad operativa** dentro de un taller (quién anuló una orden, quién cambió permisos de un usuario).
2. **Seguridad/super-admin**: vigilancia de acciones sensibles a nivel de plataforma (crear tenant, cambiar plan, suspender).
3. **Cumplimiento**: registro que no se puede alterar desde la app una vez escrito.

**Alcance v1 — catálogo curado, no todo mutation.** Se decidió explícitamente NO instrumentar automáticamente cada `create`/`update`/`delete` (ver "Enfoques considerados" abajo). Solo se audita una lista cerrada de eventos sensibles, mapeada 1:1 contra funcionalidad que **ya existe** en el código. Dos candidatos iniciales (`factura.anular`, `inventario.ajuste_manual`) se descartaron del catálogo v1 porque esa funcionalidad no existe todavía (`Factura` solo tiene estados `PENDIENTE`/`PAGADA`, sin anulación; `updateRepuestoAction` no toca `stock`). Se agregan junto con esa funcionalidad si/cuando se construya.

**Fuera de alcance v1** (explícitamente diferido):
- Auditoría automática de toda mutación (YAGNI — ver enfoques descartados).
- Inmutabilidad a nivel de base de datos (triggers/REVOKE de UPDATE-DELETE). v1 se apoya en que ninguna action expone edición/borrado de `AuditLog`, igual que el resto del diseño v1 evita infraestructura extra (ver política de backups, §8 del diseño multi-tenant).
- Acceso de roles distintos a ADMIN dentro del panel del taller (técnico/recepción no ven auditoría).

## Enfoques considerados

- **A — Helper explícito dentro de la misma transacción (elegido).** Cada action sensible llama `registrarEventoAuditoria(tx, ...)` dentro de su propio `tenantDb.$transaction`. Explícito, sin magia, atómico con el cambio real. Consistente con el estilo del proyecto (comentario de `scope.ts`: "reviewer auditing the isolation boundary in one screen"; rechazo de automatización udev en la política de backups).
- **B — Middleware/extension de Prisma con captura automática.** Requeriría `AsyncLocalStorage` para inyectar el actor y lógica para distinguir qué campo de un `update` genérico cuenta como "sensible". Más máquina, va contra el patrón explícito ya establecido. Descartado para v1.
- **C — Outbox/cola asíncrona (event sourcing).** Sobre-ingeniería para esta escala; añadiría infraestructura de colas inexistente en el stack. Descartado por YAGNI.

## Orden de implementación (commits atómicos)

1. Migración tenant: modelo `AuditLog` + enum `TipoEventoAuditoria` (`prisma/tenant/schema.prisma`).
2. Migración public: modelo `AuditLogPlataforma` + enum `TipoEventoAuditoriaPlataforma` (`prisma/schema.prisma`).
3. Módulo `src/lib/auditoria/registrarEvento.ts` (+ tests unitarios).
4. Instrumentar `updateEstadoOrdenAction` → `ORDEN_ANULAR`.
5. Instrumentar `updateUsuarioAction` → `USUARIO_ACTUALIZAR_PERMISOS` (con diff) y `deleteUsuarioAction` → `USUARIO_ELIMINAR`.
6. Instrumentar `deleteBodegaAction` → `BODEGA_ELIMINAR`.
7. Instrumentar `super-admin-actions.ts` (`crearTenantAction`, `cambiarPlanTenantAction`, `cambiarEstadoTenantAction`) → eventos de plataforma.
8. UI panel del taller: `src/app/(dashboard)/auditoria/page.tsx`.
9. UI super-admin: `src/app/superadmin/auditoria/page.tsx` + botón "Ver auditoría" por tenant en `tenant-row-actions.tsx` → `/superadmin/tenants/[tenantId]/auditoria`.

---

## 1. Modelo de datos — tenant (`prisma/tenant/schema.prisma`)

```prisma
enum TipoEventoAuditoria {
  ORDEN_ANULAR
  USUARIO_ACTUALIZAR_PERMISOS
  USUARIO_ELIMINAR
  BODEGA_ELIMINAR
}

model AuditLog {
  id          String              @id @default(cuid())
  tipo        TipoEventoAuditoria
  actorId     String?             @map("actor_id")
  actor       Usuario?            @relation(fields: [actorId], references: [id], onDelete: SetNull)
  entidadTipo String              @map("entidad_tipo")
  entidadId   String              @map("entidad_id")
  detalle     Json?
  createdAt   DateTime            @default(now()) @map("created_at")

  @@index([tipo, createdAt])
  @@index([entidadTipo, entidadId])
  @@map("audit_log")
}
```

`actorId` es `SetNull` (no `Cascade`), mismo criterio que `HistorialVehiculo.autor`: el evento debe sobrevivir a la eliminación del usuario que lo generó. Ninguna action expone `update` ni `delete` sobre `AuditLog` — solo `create` (dentro de una transacción) y lecturas.

## 2. Modelo de datos — plataforma (`prisma/schema.prisma`)

```prisma
enum TipoEventoAuditoriaPlataforma {
  TENANT_CREAR
  TENANT_CAMBIAR_PLAN
  TENANT_CAMBIAR_ESTADO
}

model AuditLogPlataforma {
  id           String                         @id @default(cuid())
  tipo         TipoEventoAuditoriaPlataforma
  superAdminId String?                        @map("super_admin_id")
  superAdmin   SuperAdmin?                    @relation(fields: [superAdminId], references: [id], onDelete: SetNull)
  tenantId     String?                        @map("tenant_id")
  tenant       Tenant?                        @relation(fields: [tenantId], references: [id], onDelete: SetNull)
  detalle      Json?
  createdAt    DateTime                       @default(now()) @map("created_at")

  @@index([tipo, createdAt])
  @@map("audit_log_plataforma")
}
```

`tenantId` es nullable porque no todo evento de plataforma es necesariamente sobre un tenant existente (aunque en el catálogo v1 los tres sí lo son). Mismo criterio `SetNull` para `superAdminId`.

## 3. Módulo de captura (`src/lib/auditoria/`)

`registrarEvento.ts`:

```ts
type TenantTx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

export async function registrarEventoAuditoria(
  tx: TenantTx,
  evento: {
    tipo: TipoEventoAuditoria;
    actorId: string | null;
    entidadTipo: string;
    entidadId: string;
    detalle?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.auditLog.create({ data: evento });
}
```

Y su hermana `registrarEventoAuditoriaPlataforma(tx, evento)` contra `db.auditLogPlataforma` (schema `public`), misma firma adaptada. Ninguna de las dos abre su propia transacción — reciben el `tx` de la action que las llama.

**Patrón de integración.** Cada action sensible envuelve su mutación existente y la llamada a `registrarEventoAuditoria` en un mismo `tenantDb.$transaction`. Ejemplo, `updateUsuarioAction` (reutiliza la lectura de `usuarioActual` que ya existe en la línea 233 para la protección del último ADMIN, para diffear contra `parsed.data`):

```ts
await tenantDb.$transaction(async (tx) => {
  await tx.usuario.update({ where: { id: usuarioId }, data: { ... } });
  const cambios = diffPermisos(usuarioActual, parsed.data);
  if (Object.keys(cambios).length > 0) {
    await registrarEventoAuditoria(tx, {
      tipo: "USUARIO_ACTUALIZAR_PERMISOS",
      actorId: session.user.id,
      entidadTipo: "Usuario",
      entidadId: usuarioId,
      detalle: cambios,
    });
  }
});
```

`updateEstadoOrdenAction` (solo cuando `nuevoEstado === "ANULADA"`), `deleteUsuarioAction`, `deleteBodegaAction` y las tres de `super-admin-actions.ts` siguen el mismo patrón.

## 4. Manejo de errores

El registro de auditoría vive **dentro** de la transacción de la mutación real — no es best-effort, a diferencia de `NotificacionOrdenEnviada` (que sí es best-effort porque el email es un efecto secundario externo, no el cambio de dato en sí). Si `registrarEventoAuditoria` falla, toda la transacción se revierte y la action devuelve el mismo error genérico que ya usan (`friendlyPrismaErrorMessage`). Perder silenciosamente un evento de seguridad/cumplimiento es peor que rechazar la operación. No hay reintentos.

## 5. UI y acceso

**Panel del taller** — `src/app/(dashboard)/auditoria/page.tsx`, protegida con `requireRole(["ADMIN"])`. Tabla server-rendered de `tenantDb.auditLog`, filtros por `tipo` y rango de fecha vía query params (sin JS de cliente, igual que el resto del dashboard), `skip/take` clásico (catálogo curado ⇒ volumen bajo, sin necesidad de paginación infinita). Cada fila enlaza a la entidad cuando aplica (`orden.anular` → `/ordenes/[id]`) y muestra `actor.nombre` o `"(usuario eliminado)"` si `actorId` es null.

**Panel de super-admin** — dos entradas:
1. `src/app/superadmin/auditoria/page.tsx`: lista `AuditLogPlataforma`, visible para cualquier `SuperAdmin` autenticado.
2. Botón "Ver auditoría" en `tenant-row-actions.tsx` (junto a Suspender/Activar) → `/superadmin/tenants/[tenantId]/auditoria`, que resuelve el schema del tenant vía `getTenantDb` (mismo mecanismo que ya usa `super-admin-actions.ts`) y muestra su `AuditLog`.

## 6. Testing

Sigue el patrón existente: un `*.test.ts` por `*-actions.ts`, Vitest, `tenantDb` mockeado vía `vi.mock("@/lib/db/tenant-client", ...)`.

- `src/lib/auditoria/registrarEvento.test.ts` (nuevo): con un `tx` mockeado, verifica que `tx.auditLog.create` (y `auditLogPlataforma.create`) recibe los campos correctos.
- En cada action instrumentada: un `it` que verifica que una llamada exitosa invoca `auditLog.create` con el `tipo`/`detalle` esperado, y uno que verifica que `USUARIO_ACTUALIZAR_PERMISOS` **no** crea fila si el update no cambia rol/`activo`/sedes.
- Un test de "todo o nada": si el mock de `auditLog.create` rechaza, la mutación principal (`usuario.update`, etc.) tampoco queda aplicada.
- Sin tests de UI nuevos más allá de lo que ya cubre la suite E2E para rutas protegidas por rol — `/auditoria` y `/superadmin/auditoria` reutilizan guards (`requireRole`, sesión `SuperAdmin`) ya cubiertos.
