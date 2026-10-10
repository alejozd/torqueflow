# Fase 15 — Vehículo y vencimientos (design)

> Fecha: 2026-10-10 · Rama: `fase15-vehiculo-vencimientos` · Roadmap: ítems 6 y 19
> (`docs/superpowers/plans/2026-10-10-roadmap-modulos-faltantes.md`).

## Objetivo

Que el taller sepa cuándo vencen el **SOAT** y la **revisión técnico-mecánica** de los
vehículos de sus clientes y les avise a tiempo (email automático + WhatsApp manual vía
wa.me), y completar la ficha del vehículo con **tipo** y **VIN**.

Fuera de alcance: consulta RUNT, avisos de otros documentos (impuesto, licencia),
API de WhatsApp (solo wa.me — ver memoria del proyecto).

## 1. Modelo de datos (schema tenant)

### `Vehiculo` — columnas nuevas

| Campo | Tipo | Notas |
|---|---|---|
| `tipo` | `TipoVehiculo` (`CARRO`, `MOTO`, `CAMIONETA`, `CAMION`) | `NOT NULL DEFAULT 'CARRO'` → vehículos existentes quedan como CARRO |
| `vin` | `String?` | Opcional. Se normaliza a mayúsculas y sin espacios; si viene, debe cumplir `^[A-HJ-NPR-Z0-9]{17}$` (17 caracteres, sin I/O/Q) |
| `soatVence` | `DateTime? @db.Date` | Fecha de vencimiento del SOAT |
| `tecnomecanicaVence` | `DateTime? @db.Date` | Fecha de vencimiento de la RTM |

**Placa:** la validación existente (obligatoria) no cambia. Se agrega un **aviso no
bloqueante** en el formulario: si el tipo es MOTO y la placa no cumple `^[A-Z]{3}\d{2}[A-Z]$`,
o si es otro tipo y no cumple `^[A-Z]{3}\d{3}$`, se muestra "El formato de placa no es el
habitual para este tipo de vehículo" sin impedir guardar (placas antiguas, diplomáticas,
remolques).

### `AvisoVencimiento` — tabla nueva

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `vehiculoId` | FK → `Vehiculo` (`onDelete: Cascade`) | |
| `tipo` | `TipoDocumentoVehiculo` (`SOAT`, `TECNOMECANICA`) | |
| `fechaVencimiento` | `DateTime @db.Date` | La fecha que se avisó |
| `canal` | `CanalAviso` (`EMAIL`, `WHATSAPP`) | |
| `destino` | `String` | Email o teléfono usado |
| `enviadoPorId` | FK? → `Usuario` | `null` cuando lo envía el cron |
| `enviadoAt` | `DateTime @default(now())` | |

`@@unique([vehiculoId, tipo, fechaVencimiento, canal])` — de-duplicación: una misma
fecha de vencimiento se avisa como máximo una vez por canal; al renovar (fecha nueva) se
puede avisar de nuevo. Es independiente de `RecordatorioEnviado` (mantenimiento), que no
se toca.

> WhatsApp: el registro se crea al hacer clic en "Avisar por WhatsApp". Un segundo clic
> sobre la misma fecha no duplica (upsert por la clave única; actualiza `enviadoAt`).

### `ConfiguracionTaller` — tabla nueva (singleton)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id @default("singleton")` | Mismo patrón que `ConfiguracionSmtp` |
| `diasAvisoVencimiento` | `Int @default(30)` | Rango válido 1–90 |
| `updatedAt` | `DateTime @updatedAt` | |

Lectura con fallback: si no existe la fila, se usa 30 (no hace falta sembrarla).

### Migración

Una migración tenant (`prisma/tenant/migrations/<ts>_vehiculo_vencimientos`) con enums,
columnas y tablas. Se aplica a todos los schemas con el mecanismo de migración por tenant
existente (ver `docs/DEPLOY.md`).

## 2. Lógica de dominio — `src/lib/vencimientos/`

- `estado-vencimiento.ts` — función pura
  `estadoVencimiento(fecha: Date | null, hoy: Date, diasAviso: number)` →
  `"SIN_DATO" | "VIGENTE" | "POR_VENCER" | "PROXIMO" | "VENCIDO"`:
  - `VENCIDO`: fecha < hoy
  - `PROXIMO`: 0–7 días
  - `POR_VENCER`: 8–`diasAviso` días
  - `VIGENTE`: > `diasAviso` días
  - Las comparaciones son por **fecha calendario en America/Bogota**, no por instante.
- `plantilla.ts` — textos del aviso (asunto + cuerpo email, texto WhatsApp) con placa,
  documento y fecha en formato `es-CO`, siguiendo el estilo de `src/lib/recordatorios/plantilla.ts`.
- `ejecutar-avisos.ts` — barrido de email, **sin imports de Prisma** (mismo patrón que
  `ejecutar-recordatorios.ts`: dependencias inyectadas, testeable con mocks). Reglas:
  - Por tenant ACTIVO con SMTP activo: vehículos con `soatVence` o `tecnomecanicaVence`
    en estado `PROXIMO`/`POR_VENCER`, o `VENCIDO` hace ≤ 30 días (no se persigue
    indefinidamente a vehículos vencidos hace meses).
  - Omitir si el cliente no tiene email o ya existe `AvisoVencimiento` (EMAIL) para esa
    fecha.
  - Política de fallos idéntica al barrido de mantenimiento: un tenant/email fallido no
    aborta el resto; un envío fallido **no** se registra (se reintenta en la próxima
    corrida); errores reportados solo por nombre de clase.
- `gateway-prisma.ts` — implementación Prisma del gateway.

**Refactor dirigido:** `urlWhatsapp()` vive hoy en `src/lib/pedido-compra/pedido-compra.ts`;
se mueve a `src/lib/whatsapp/url.ts` (re-exportado o con imports actualizados) para
reutilizarlo sin acoplar vencimientos a pedidos de compra.

## 3. Cron

El route existente `src/app/api/cron/recordatorios/route.ts` ejecuta, después del barrido
de mantenimiento, el barrido de avisos de vencimiento y devuelve ambos resúmenes
(`{ mantenimiento, vencimientos }`). Así no cambia el crontab del servidor. Cada barrido
corre en su propio try/catch: si uno lanza, el otro igual se ejecuta.

## 4. UI

### Formulario de vehículo (nuevo/editar — `vehiculo-form-fields.tsx`)
- Selector **Tipo** (Carro/Moto/Camioneta/Camión) en el grupo de datos básicos.
- Campo **VIN** (opcional, mayúsculas automáticas, error si formato inválido).
- Grupo nuevo **Vencimientos**: `SOAT vence`, `Tecnomecánica vence` (inputs date).
- Aviso no bloqueante de formato de placa (ver §1).
- `vehiculoInputSchema` (`src/lib/validation/vehiculo.ts`) y las actions create/update se
  extienden con los 4 campos.

### Detalle del vehículo (`/vehiculos/[id]`)
- Tipo y VIN en la ficha.
- Insignias SOAT / Tecnomecánica con el estado (`VIGENTE` verde, `POR_VENCER` ámbar,
  `PROXIMO` naranja, `VENCIDO` rojo, `SIN_DATO` gris "Sin registrar").

### Vista nueva `/vencimientos`
- Menú: grupo **Operación**, ítem "Vencimientos". Roles: ADMIN y RECEPCION (TECNICO no).
- Tabla (`src/components/data-table*.tsx` existentes, paginada/búsqueda por placa o cliente): placa, tipo de
  vehículo, cliente, documento (SOAT/RTM), fecha, estado (insignia), último aviso
  (canal + fecha) y acciones.
- Una fila por documento por vencer/vencido (un vehículo con ambos aparece dos veces).
- Incluye: estados `PROXIMO`, `POR_VENCER` y `VENCIDO` (sin límite de antigüedad en la
  vista, a diferencia del barrido de email).
- Filtros: documento (todos/SOAT/RTM), estado (todos/vencidos/por vencer), "solo sin avisar".
- Acción **"Avisar por WhatsApp"**: server action que registra el `AvisoVencimiento`
  (WHATSAPP, `enviadoPorId` = usuario) y el cliente abre la URL wa.me con el texto de
  `plantilla.ts`. Deshabilitado con tooltip si el cliente no tiene teléfono.
- Link a la ficha del vehículo.

### Nueva orden
- Al seleccionar el vehículo (flujo de `client-vehicle-selector` / nueva orden), si SOAT o
  RTM están `PROXIMO`/`POR_VENCER`/`VENCIDO`, se muestra un aviso informativo
  (no bloquea): "SOAT vencido el 12/09/2026 — recuérdaselo al cliente".

### Dashboard
- Tarjeta KPI "Vencimientos próximos" = número de documentos en `PROXIMO`+`POR_VENCER`+`VENCIDO`,
  enlazando a `/vencimientos`. Visible para ADMIN y RECEPCION.

### Configuración
- En `/configuracion-smtp`, sección nueva **"Recordatorios"** (solo ADMIN): campo
  "Días de anticipación para avisos de vencimiento" (1–90). Server action con validación
  Zod. Sin auditoría: `TipoEventoAuditoria` solo cubre eventos destructivos/de permisos y
  la configuración SMTP tampoco se audita.

## 5. Seguridad y multi-tenant

- Todas las lecturas/escrituras por `getTenantDb` (`src/lib/db/tenant-client.ts`); las
  actions usan los guards de `src/lib/auth/guards.ts` + chequeo de rol, como el resto del
  dashboard.
- Vehículos y vencimientos son del tenant (no por sede): la vista muestra todos los
  vehículos del taller, igual que `/clientes`.
- La action de WhatsApp verifica que el vehículo exista en el tenant antes de registrar;
  el texto del mensaje se arma en servidor (no se acepta texto del cliente).

## 6. Testing

- Unit (Vitest): `estadoVencimiento` (bordes 0/7/8/diasAviso/diasAviso+1, zona horaria),
  validación VIN y aviso de placa, `plantilla`, `ejecutarAvisos` con mocks (sin SMTP,
  sin email, ya avisado, fecha renovada, fallo de envío no registra, fallo de tenant
  no aborta).
- Componentes: formulario de vehículo con campos nuevos, insignias, botón WhatsApp
  deshabilitado sin teléfono, aviso en nueva orden.
- Actions: crear/editar vehículo con campos nuevos, registrar aviso WhatsApp (upsert,
  rol TECNICO rechazado), guardar configuración (rango 1–90, solo ADMIN).
- Verificación final: `tsc --noEmit` + suite completa al cierre de cada tarea (RULES §4).
