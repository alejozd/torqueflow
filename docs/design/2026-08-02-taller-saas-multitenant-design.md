# Diseño: Plataforma SaaS multi-tenant para gestión de talleres/servitecas (TorqueFlow)

> Este documento es el resultado de una sesión de brainstorming previa, hecha en el contexto del proyecto legado `F:\Proyectos\Imperio\Soft_imperio` (sistema Delphi "Imperio" que nunca se puso en producción). Se copia aquí íntegro como punto de partida de **TorqueFlow**, el proyecto nuevo. Referencias cruzadas al repo legado (diagnóstico, DDL original) usan rutas absolutas porque viven fuera de esta carpeta.

## 1. Contexto y motivación

El sistema Delphi original (`Imperio`, en `F:\Proyectos\Imperio\Soft_imperio`) nunca se puso en producción: la persona que iba a operarlo en el taller de un familiar era de edad avanzada y no quiso adoptarlo. Ese fracaso de adopción es la razón de este pivote, no un problema técnico del código legado.

Decisiones que cambian el proyecto:
- Ya no se migra el sistema legado tabla por tabla. Se construye una aplicación nueva, informada por investigación de mercado de software de gestión de talleres en 2026.
- El operador día a día ya no será la persona mayor original, sino alguien más joven/tech-friendly — esto libera al diseño de UI de restricciones extremas de simplicidad, aunque se mantiene el criterio de UX moderna y clara.
- La lógica de negocio del sistema Delphi (facturación, órdenes de trabajo) **ya no es una restricción a preservar**: el usuario decidió explícitamente abrir el diseño a lo que ofrece el mercado actual, y adaptar al caso del familiar al final si hace falta, en vez de partir de la lógica legacy. El diagnóstico legado completo (tablas, DDL real en `F:\Proyectos\Imperio\Soft_imperio\Database\ImperioBD.sql`) queda como referencia histórica, no como contrato a cumplir.
- El proyecto pasa de "una app para un taller" a **producto SaaS multi-tenant**: el usuario tiene un servidor Ubuntu propio (i5, 8 GB RAM, SSD 512GB, año 2013) con Cloudflare ya contratado (3 años) para exponerlo a internet, y quiere ofrecerlo en arriendo a varios talleres. También quiere poder instalar una copia privada, on-premise, para el cliente que no quiera depender de un arriendo mensual.

## 2. Investigación de mercado (resumen)

Búsqueda sobre software de gestión de talleres 2026 (Tekmetric, AutoLeap, Orderry, WinMotor, TallERP, Reparan2, entre otros):

- El modelo dominante es SaaS en la nube, con suscripción mensual que incluye hosting, actualizaciones y soporte.
- Funciones esperadas hoy, más allá de lo que ya cubría el sistema Delphi:
  - **Inspección vehicular digital (DVI)** con fotos antes/después y checklist.
  - **Notificaciones automáticas al cliente** sobre el estado de su orden vía SMS/WhatsApp.
  - **Agendamiento de citas online.**
  - **Descuento automático de inventario** ligado directamente a la orden de servicio, con alertas de reabastecimiento.
  - **Recordatorios de mantenimiento preventivo.**
  - **Dashboards de rentabilidad** y reportes de operación en tiempo real.
  - **Procesamiento de pagos online** e integraciones contables (ej. QuickBooks).
- Precios de mercado (referencia España): planes básicos 25-45 €/mes, estándar 60-90 €/mes, avanzado 100+ €/mes para multi-sede. Sirve como referencia de segmentación de planes, no como definición cerrada de precio.

Fuentes: [8 Best Auto Repair Software - 2026 Reviews & Pricing](https://www.softwareadvice.com/auto-repair/) · [11 Popular Auto Repair Shop Management Software (2026)](https://dealr.cloud/blog/best-auto-repair-shop-management-software) · [How to Choose the Best Auto Repair Software in 2026 | Orderry](https://orderry.com/blog/best-auto-repair-software/) · [Top 7 Auto Shop Management Software Trends in 2026](https://evincedev.com/blog/auto-shop-management-software-guide/) · [Los 10 Mejores Software de Gestión para Talleres Mecánicos en 2026](https://flujotaller.es/blog/software-gestion-taller.html) · [Software taller mecánico 2026: guía](https://www.winmotorcloud.com/es/software-taller-mecanico-guia-2026/) · [TallERP: Guía de Selección 2026](https://tallerp.com/blog/como-elegir-el-mejor-software-para-taller-mecanico-en-2026)

## 3. Arquitectura técnica

**Stack**: Next.js (App Router, full-stack — UI + API routes en un solo proyecto) + Prisma ORM + PostgreSQL.

**Por qué**: Next.js elimina la necesidad de un backend Express separado (un solo despliegue). Prisma es el ORM TypeScript moderno con mejor soporte de migraciones y tipado. PostgreSQL fue elegido sobre MySQL específicamente porque soporta **schemas** como unidad de aislamiento nativa (ver §4) — MySQL no tiene un equivalente igual de limpio.

**Hosting**: Docker Compose en el servidor Ubuntu del usuario (i5, 8 GB RAM, SSD 512 GB), expuesto a internet vía Cloudflare Tunnel (ya contratado). El equipo de desarrollo (Windows, este PC) **no instala ningún motor de BD localmente** — se conecta al Postgres del servidor Ubuntu por la red local, igual que se decidió evitar instalar MySQL/Firebird aquí.

**Estructura de repositorio**: un único repositorio Git en `F:\Proyectos\TorqueFlow` (Next.js unifica frontend y backend en un solo proyecto — no hay repos separados de backend/frontend).

## 4. Multi-tenancy: un schema PostgreSQL por taller

Modelo elegido (de 3 evaluados: shared-schema+tenant_id, schema-per-tenant, database-per-tenant): **un schema de PostgreSQL por taller**, dentro de la misma instancia.

- Una sola base de datos (`torqueflow`) en el servidor Postgres.
- Cada taller (`tenant`) tiene su propio schema dentro de esa base de datos (`taller_perez`, `taller_gomez`, ...) con las mismas tablas, más un schema `public` para las tablas globales (lista de tenants, planes, datos de super-admin).
- Un *schema* es un namespace de tablas **dentro** de la base de datos, no una base de datos nueva ni una conexión nueva — más atómico que crear una BD por cliente.
- Prisma corre las migraciones una vez por schema y selecciona el schema activo por conexión (parámetro `schema` en la connection string o `search_path`).
- La app resuelve el tenant por el **email** del usuario que inicia sesión (índice `TenantUserEmail` en el schema `public`) y selecciona la conexión/schema correspondiente en cada request. **Nota (2026-08-25, Fase 10):** el modelo original resolvía el tenant por subdominio de primer nivel bajo el dominio base; se reemplazó por resolución por email para exponer una única URL de entrada (`torqueflow.zdevs.uk`) en vez de un subdominio por taller. La decisión de subdominio original queda documentada en §4.1 como registro histórico; el modelo actual se detalla en `docs/design/notes/2026-08-25-tenant-resolution-by-email.md`.
- **Camino de "buyout" a on-premise**: si un cliente quiere privacidad total y dejar de depender del arriendo mensual, su schema se exporta con `pg_dump --schema=taller_x` y se despliega como instancia standalone (mismo `docker-compose`, un solo tenant) en su propia infraestructura — sin tocar los datos de otros talleres.
- Se prefirió sobre `tenant_id` compartido porque el requisito de "poder entregarle sus datos a un cliente que se independiza" es explícito del usuario, y con un schema propio es una operación de un comando, no un filtrado fila por fila con riesgo de fuga de datos entre talleres.
- Se prefirió sobre base de datos por tenant porque, a la escala inicial (unos pocos talleres, un servidor modesto), administrar N bases de datos separadas es más pesado operativamente que N schemas en una sola instancia.

### 4.1 Resolución de tenant: subdominio de un solo nivel

> **Superseded (Fase 10, 2026-08-25).** El sistema ya no resuelve el tenant
> por subdominio — ver la nota en §4 y
> `docs/design/notes/2026-08-25-tenant-resolution-by-email.md`. Esta sección
> queda como registro histórico de la decisión original (motivo: límite del
> certificado Universal SSL gratuito de Cloudflare) y de por qué se
> abandonó.

Dominio base del usuario: `zdevs.uk` (Cloudflare), ya usado para otras apps (`conteosapp.zdevs.uk`, `exogena.zdevs.uk`, `custodiastock.zdevs.uk`).

- Cada taller se expone en `<slug-taller>.zdevs.uk` (ej. `taller-perez.zdevs.uk`) — **un solo nivel** bajo el dominio base, no anidado bajo `torqueflow.zdevs.uk`.
- Motivo: el certificado Universal SSL gratuito de Cloudflare solo cubre el apex y subdominios de primer nivel (`*.zdevs.uk`); un patrón de dos niveles (`*.torqueflow.zdevs.uk`) requeriría Advanced Certificate Manager de pago, descartado por presupuesto actual.
- Se configura un hostname comodín `*.zdevs.uk` en el Cloudflare Tunnel apuntando a TorqueFlow. Como DNS resuelve primero los registros específicos existentes, esto no interfiere con `conteosapp`, `exogena` ni `custodiastock`.
- Cada taller nuevo queda operativo sin tocar DNS ni el Tunnel — solo se da de alta el tenant en el panel de super-admin.
- Revisitar si más adelante se compra un dominio propio para TorqueFlow (mencionado como posibilidad futura) — en ese caso sí sería viable anidar bajo un dominio dedicado sin la limitación de Universal SSL.

## 5. Módulos funcionales v1

Definidos abiertamente a partir de la investigación de mercado (no atados a la lógica del sistema Delphi legado):

1. **Clientes y vehículos** — CRM básico, historial por vehículo.
2. **Órdenes de trabajo / facturación** — ítems, mano de obra, IVA, descuentos, estados (en proceso/aplicada/anulada).
3. **Inspección vehicular digital (DVI)** — checklist + fotos antes/después asociadas a la orden.
4. **Inventario y bodegas** — stock por bodega, descuento automático al aplicar una orden, alertas de reabastecimiento.
5. **Proveedores y entradas de mercancía.**
6. **Notificaciones automáticas al cliente** — estado de la orden vía WhatsApp/SMS.
7. **Agendamiento de citas online.**
8. **Recordatorios de mantenimiento preventivo.**
9. **Dashboard de rentabilidad y reportes** operativos.
10. **Usuarios, roles y permisos** — por taller (cada tenant administra los suyos).
11. **Panel de super-admin** (el usuario, como proveedor del SaaS) — alta/baja de talleres (tenants), estado de cada uno. La facturación del arriendo en sí puede ser manual en v1 (ver §6, fuera de alcance).
12. **Sedes (multi-sede)** — un tenant puede tener varias ubicaciones físicas dentro del mismo schema (no son tenants separados).

    **Estrategia de lanzamiento: arquitectura preparada, MVP de una sola sede** (decisión 2026-08-20, ver §11). El taller real donde se desplegará el sistema ya opera con varias sedes — multi-sede no es opcional a mediano plazo — pero para lanzar más rápido, el modelo de datos completo (`Sede`, `sede_id` en las entidades relevantes) se construye desde el principio en cada módulo que lo requiera, mientras la UI de gestión de sedes, el selector de sede y el enforcement de consultas por sede activa se activan en una fase posterior dedicada (Fase 6). Esto evita una migración de esquema disruptiva más adelante: llegado el momento, activar multi-sede es trabajo de UI/enforcement, no de columnas nuevas.

    Modelo de datos:
    - `Sede` (id, nombre, dirección) nueva entidad por schema de tenant.
    - `Bodega` (módulo 4) pasa a pertenecer a una `Sede` (`sede_id`).
    - `OrdenTrabajo` (módulo 2) y `Cita` (módulo 7) llevan `sede_id` — se originan en una ubicación concreta.
    - `Usuario` se vincula a una o varias sedes vía tabla puente `UsuarioSede`; roles de técnico/recepción quedan acotados a sus sedes asignadas, el admin del taller ve todas.
    - Clientes y vehículos siguen compartidos a nivel de tenant (un cliente puede llevar su vehículo a cualquier sede del mismo taller).
    - El dashboard de rentabilidad (módulo 9) suma sede como dimensión de filtro/comparación.
    - Gating por plan: ver §9.

    **Antes de la Fase 6**: al provisionar un tenant nuevo (`provisionTenant`, Fase 1) se crea automáticamente una `Sede` por defecto; cada módulo que introduce una entidad con `sede_id` (Órdenes en Fase 2, Bodegas/Repuestos en Fase 3, Citas en Fase 7) la asocia a esa sede única desde su propia migración. No hay selector de sede en la UI ni tabla `UsuarioSede` poblada más allá de esa sede por defecto hasta que la Fase 6 la active.

## 6. Explícitamente fuera de alcance en v1 (YAGNI)

- Cobro automático de suscripción del arriendo (Stripe u otro) — en v1 se factura manualmente a cada taller arrendatario.
- App móvil nativa — la web responsive (Next.js) cubre el caso de uso inicial.
- Integraciones contables externas (QuickBooks u otras).
- Soporte multi-idioma.

## 7. Autenticación y autorización

NextAuth (o equivalente) con JWT. Roles por tenant (admin del taller / técnico / recepción). El aislamiento entre talleres se garantiza a nivel de aplicación (resolución de schema por tenant en Prisma) y puede reforzarse con Row-Level Security de PostgreSQL como capa adicional si se detecta necesidad.

## 8. Política de backups

Destino: disco externo del usuario, conectado periódicamente (no permanente) al servidor Ubuntu. Sin proveedor cloud en v1 ("ya veremos" más adelante).

- **Dump**: `pg_dump -Fc` (formato custom, comprimido) de toda la base `torqueflow` cada noche vía cron. El formato custom permite restaurar la base completa o un solo schema (`pg_restore --schema=taller_x`), cubriendo tanto desastre total como recuperación puntual de un tenant.
- **Retención local**: dumps en `/var/backups/torqueflow/` con poda automática (ej. últimos 14 días) para no saturar el SSD de 512 GB compartido con la app.
- **Copia al disco externo**: manual — un script (`backup-to-external.sh`) que el usuario corre al conectar el disco, sincronizando los dumps acumulados desde el último backup físico. Se descarta automatización por udev en v1 (no aporta sobre el script manual a esta escala).
- **Encriptación**: dumps cifrados con `gpg` antes de copiarse al disco externo (o disco cifrado con LUKS), dado que contienen PII de clientes de varios talleres y el disco sale físicamente del servidor.
- **Prueba de restore**: restauración de prueba trimestral a un schema descartable, para confirmar que el dump realmente sirve.
- **RPO aceptado**: hasta 24h de pérdida de datos ante fallo total del servidor (dump nightly) más el intervalo real entre conexiones del disco externo — explícitamente fuera de alcance en v1: WAL archiving / PITR continuo (§6, YAGNI).

## 9. Planes y niveles de suscripción

Estructura de 3 niveles (alineada a la investigación de mercado, §2): **básico / estándar / avanzado**. Los planes controlan capacidades reales de la app, no son solo referencia comercial.

- **Modelo de datos**: entidad `Plan` en el schema `public` (global) — nombre, precio de referencia, `maxUsuarios`, `maxSedes`, y flags de módulos habilitados (ej. `hasDVI`, `hasAgendamiento`, `hasWhatsapp`). Se prefieren columnas explícitas sobre un JSON dinámico: son 3 niveles fijos y conocidos, no planes custom por tenant.
- `Tenant` (schema `public`) referencia su `Plan` vía `planId`. Asignación y cambio de plan se hacen manualmente desde el panel de super-admin (módulo 11), consistente con la facturación manual del arriendo (§6).
- **Enforcement**: server-side, no solo ocultar en la UI. Antes de ejecutar una acción gateada (crear sede, enviar notificación WhatsApp, agendar cita online) se valida el plan del tenant resuelto en el request.
- **Multi-sede** (§5, módulo 12) queda ligado al plan avanzado: básico y estándar limitan a 1 sede (sin selector de sede en la UI); avanzado habilita N sedes y las comparativas de dashboard entre sedes.

**Matriz de features por plan**: estándar agrupa todas las funciones "cliente-facing" del mercado (DVI, WhatsApp, agendamiento, recordatorios); avanzado no suma módulos nuevos, solo multi-sede y límites más altos.

| Capacidad | Básico | Estándar | Avanzado |
|---|---|---|---|
| Clientes y vehículos | ✅ | ✅ | ✅ |
| Órdenes de trabajo / facturación | ✅ | ✅ | ✅ |
| Inventario y bodegas | ✅ | ✅ | ✅ |
| Proveedores y entradas de mercancía | ✅ | ✅ | ✅ |
| Usuarios y roles (`maxUsuarios`) | ✅ (sugerido: 3) | ✅ (sugerido: 10) | ✅ (sugerido: sin límite práctico) |
| Inspección vehicular digital (DVI) | ❌ | ✅ | ✅ |
| Notificaciones WhatsApp/SMS | ❌ | ✅ | ✅ |
| Agendamiento de citas online | ❌ | ✅ | ✅ |
| Recordatorios de mantenimiento preventivo | ❌ | ✅ | ✅ |
| Dashboard de rentabilidad | Totales básicos | Reportes completos (1 sede) | Reportes + comparativa entre sedes |
| Sedes (`maxSedes`) | 1 | 1 | N |

Los valores sugeridos de `maxUsuarios` son defaults iniciales, ajustables sin cambiar el modelo de datos (son columnas en `Plan`, no lógica hardcodeada).

**Nota (2026-08-20)**: el modelo de datos multi-sede (`Sede`, `sede_id`) se construye desde la Fase 2 en todos los planes por igual (ver §5, módulo 12); lo que la Fase 6 activa es la UI y el enforcement de `maxSedes` > 1, no el esquema.

## 10. Decisiones abiertas (a resolver antes o durante la implementación)

- Precio exacto (€ o moneda local) de cada plan — el modelo de datos ya soporta el campo, falta definir el número.
- Valores finales de `maxUsuarios` por plan (§9 propone defaults ajustables: 3/10/sin límite práctico).

## 11. Roadmap de fases (actualizado 2026-08-20)

**Fase 1 (núcleo — auth, multi-tenant, Clientes/Vehículos/Historial) completada.** Los módulos restantes se secuencian priorizando velocidad de lanzamiento sobre completitud inmediata, con **arquitectura multi-sede preparada desde el inicio pero activada al final** (decisión de la sección §5, módulo 12 — motivo: el taller real que usará el sistema ya opera con varias sedes, pero construir la UI multi-sede de entrada retrasaría el lanzamiento sin necesidad, dado que el modelo de datos puede quedar listo desde ya):

- **Fase 2** — Órdenes de trabajo + Inspección vehicular digital (DVI), con `sede_id` ya presente en el modelo (módulos 2 y 3, §5).
- **Fase 3** — Inventario, repuestos y proveedores, con `sede_id` en `Bodega` (módulos 4 y 5, §5).
- **Fase 4** — Facturación y pagos (parte de facturación del módulo 2, §5).
- **Fase 5** — Dashboard y reportes básicos (módulo 9, §5).
- **Fase 6** — Gestión de sedes: UI de administración, selector de sede en login, enforcement de `maxSedes` y de consultas por sede activa — activa multi-sede completo sobre el modelo de datos ya existente (módulo 12, §5).
- **Fase 7** — Agendamiento de citas + recordatorios de mantenimiento preventivo (módulos 7 y 8, §5).
- **Fase 8** — Notificaciones automáticas al cliente vía WhatsApp/Email (módulo 6, §5).
- **Fase 9** — Panel de super-admin + planes y niveles de suscripción (módulos 10 y 11, §5).
- **Fase 10** (2026-08-25) — Cambio arquitectónico, no un módulo nuevo: resolución de tenant por email en vez de por subdominio, exponiendo una única URL de entrada en vez de un subdominio por taller. Ver `docs/design/notes/2026-08-25-tenant-resolution-by-email.md` y la nota en §4/§4.1.

Precios exactos y valores finales de `maxUsuarios`/`maxSedes` (§10) siguen sin definir — deben resolverse antes de exponer el panel de super-admin a talleres reales (Fase 9), no bloquean el desarrollo de fases anteriores.

Cada fase se convierte en su propio plan de implementación con el skill `writing-plans` al comenzarla, siguiendo el mismo patrón usado para la Fase 1.
