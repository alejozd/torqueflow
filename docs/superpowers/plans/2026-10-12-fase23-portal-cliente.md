# Fase 23 — Portal del cliente: enlace público del estado de la orden y encuesta posventa (medición y aplazamiento)

> Rama: **ninguna** · Roadmap ítems **10** (enlace público de la orden) y **20** (encuesta posventa / reseña
> Google), los dos de prioridad media.
> **Estado: APLAZADA por decisión del usuario (2026-10-12), junto con la facturación electrónica DIAN.**
> Este documento **no es un plan de tareas**: es la medición de riesgos y esfuerzo hecha antes de decidir, para
> que cuando se retome no haya que empezar de cero. Si algún día se ejecuta, primero hay que convertirlo en
> plan (spec + tareas) siguiendo el formato de las fases 21 y 22.

---

## 1. Por qué se aplaza

Se midió antes de empezar y el resultado fue claro: la fase es **algo mayor que las fases 21 y 22 (del orden de
+30–40 %)** y, sobre todo, **introduce tres cosas que hoy no existen en el proyecto**:

1. una **superficie sin sesión** (hoy ninguna ruta sirve datos de un taller sin autenticar);
2. una **escritura anónima** (la respuesta de la encuesta, si se guarda desde el enlace);
3. un **ciclo de vida de credencial** (token con expiración y revocación: hoy no hay ninguno).

El usuario prefirió no abrir esa superficie todavía y dejarla en la cola junto con DIAN.

## 2. Qué se verificó en el código (evidencia, no estimación)

| Hecho | Dónde | Consecuencia |
|---|---|---|
| El guard de rutas **no** autentica: `proxy.ts` solo pone el nonce/CSP | `src/proxy.ts:10-21`, matcher `:23-34` | Crear la página pública fuera del grupo `(dashboard)` **no requiere tocar ningún guard**. El riesgo no es "abrir un hueco", es que la página nueva herede un guard por copiar y pegar (si va dentro del grupo, el enlace no funciona) o que pierda el suyo. |
| **Ninguna imagen es alcanzable sin sesión** | `src/app/api/uploads/[...path]/route.ts:18-23` | Las fotos del DVI y la firma del acta son el coste oculto del enlace: exigen una ruta de archivo **nueva** atada al token. Relajar la existente expondría los archivos de **todos** los tenants (sub-riesgo alto). |
| **No existe nada** de tokens, expiración ni revocación | búsqueda en todo el repo, sin resultados | Sería la primera credencial almacenada para un tercero. Lo único reutilizable es el idioma de comparación de `CRON_SECRET` (sha256 + `timingSafeEqual`, `src/app/api/cron/recordatorios/route.ts:42-44`). |
| El tenant se resuelve por `schemaName`; `getTenantDb(schema)` abre cualquier taller sin comprobar nada | `src/lib/tenant/resolve-tenant.ts:14-19`, `src/lib/db/tenant-client.ts:97-106` | **La mayor fuente de sorpresa**: una petición anónima no sabe el schema (es justo el dato que intenta descubrir), así que hay que decidir dónde vive el token antes de escribir nada. |
| `Tenant` (base de control) tiene `slug` y `schemaName` únicos y `estado`; `publicDb` existe | `prisma/schema.prisma:35-40`, `src/lib/db/public-client.ts:7` | La comprobación de taller **ACTIVO** hay que hacerla a mano en la ruta pública (un cargador sin sesión no hereda `guards.ts:23-25`). |
| `ENTREGADA` está excluida a propósito de los avisos por correo | `src/lib/notificaciones/plantilla.ts:6-11` | La encuesta no puede colgarse del aviso de entrega: le falta **disparador**, no canal (SMTP y wa.me ya existen). |
| **No hay rate limiting propio** | solo `express-rate-limit` como dependencia transitiva en el lock | La fuerza del token es la única defensa contra la fuerza bruta y contra un POST anónimo repetido. |
| Nada fija qué rutas son públicas y las dos vistas "de cara al cliente" no tienen test | `src/proxy.test.ts:31-39`; sin `page.test.tsx` para `acta/imprimir` ni `cotizaciones/[id]/imprimir` | Añadir una ruta pública no rompe ningún test, y **romper su privacidad tampoco**. Habría que escribir esa red desde cero. |
| El vector de fuga más fácil es la consulta: Prisma devuelve todas las columnas escalares si no se acota | `Repuesto.precioCompra` `prisma/tenant/schema.prisma:470` alcanzable por `ItemOrden.repuestoId` `:357` | Un `select` sin acotar publica el precio de compra. Es un error de una línea. |

## 3. Registro de riesgos (severidad)

| # | Riesgo | Sev. | Mitigación a aplicar cuando se retome |
|---|---|---|---|
| R1 | **Primera superficie sin sesión**: un fallo de diseño deja ver datos de otro taller | **Alto** | Token atado al tenant al crearse (nunca aceptar un schema desde la URL), comprobación de `Tenant.estado = ACTIVO`, y tests de "token de A no lee B" |
| R2 | **Privacidad**: precios de compra, datos del cliente, firma, fotos | **Alto** | `select` explícito y mínimo + un test que afirme que el objeto devuelto **no** trae `precioCompra` |
| R3 | Relajar `/api/uploads` "para que se vean las fotos" | **Alto** | Prohibido: ruta nueva atada al token, y un test que fije que `/api/uploads` sigue cerrado sin sesión |
| R4 | Token adivinable o eterno, sin poder cortarlo | Medio-Alto | `randomBytes` (no `randomUUID`), guardar el **hash**, `expiraEn` + `revocadoEn`, y poder regenerar desde la ficha |
| R5 | Sin atadura de sede: el cargador público no tiene `sedeActivaId` | Alto | El token apunta a **una** orden concreta (no a un listado), que es el cinturón que sustituye a `scopeOrden` |
| R6 | Encuesta sin disparador (la entrega no notifica) | Medio | Encuesta dentro del propio enlace (cero infraestructura) o botón manual, antes que un barrido nuevo en el cron |
| R7 | POST anónimo que escribe sin defensa | Medio | Una respuesta por token y token de un solo uso para responder; no hay rate limiting que reutilizar |
| R8 | Enlace vencido sin explicación (no hay `not-found.tsx`) | Medio | Página de "enlace vencido" propia + regenerar desde la ficha |
| R9 | Fuga por referrer del token que va en la URL | Bajo (hoy) | Ya contenido por `Referrer-Policy` (`src/lib/security-headers.ts:19`) y la CSP: **no añadir recursos externos** a la página pública |
| R10 | Migración y configuración nuevas | Medio | Igual que las fases 21 y 22: respaldo, `migrate deploy` por schema y verificación de diff vacío |

## 4. Esfuerzo estimado (bloques y tallas)

| # | Bloque | Talla | Lo más incierto |
|---|---|---|---|
| 1 | Token + expiración + revocación + modelo + migración | **M** | **Dónde vive la tabla** (schema público o del taller) y hash frente a claro: condiciona todo lo demás |
| 2 | Ruta pública y resolución sin sesión | **M** | Semántica del canje (¿se marca usado?) y el enlace vencido |
| 3 | Vista de solo lectura | **M–L** | **Las fotos**, y reutilizar el JSX del acta sin romper la imprimible (que no tiene test) |
| 4 | Encuesta + enlace de reseña | **M–L** | Anti-abuso de la escritura anónima, y si el enlace de Google es del taller o de cada sede |
| 5 | Configuración del taller (duración, URL de reseña) | **S–M** | Taller frente a sede (un Google Business Profile por sede es lo realista y es más trabajo) |
| 6 | Tests (token, atadura, `select` mínimo, `/api/uploads` cerrado) | **M** | Que el test del `select` mínimo sea significativo |

**Total:** ~1 × S + 4 × M + 2 × M–L ≈ **una fase "L"**, 5–6 tareas y 1–2 migraciones. Comparable a la 21 y la 22
en volumen, mayor en incertidumbre.

## 5. Decisiones que quedaron abiertas (con mi recomendación de entonces)

1. **Qué muestra el enlace** → recomendé estado + DVI (checklist y fotos) + cotización, dejando las fotos como decisión aparte por ser la parte cara. Las alternativas eran solo estado, o todo lo del acta.
2. **Cuándo se genera** → recomendé **manual** ("compartir enlace" en la ficha), que es lo que el taller ya hace a mano por WhatsApp, y automatizarlo después.
3. **Duración y revocación** → recomendé **configurable** en la configuración del taller (7 días por defecto) con revocación siempre, porque el roadmap ya promete expiración.
4. **Canal de la encuesta** → recomendé **dentro del propio enlace público** (cero infraestructura nueva) más un recordatorio manual por WhatsApp; el correo automático exige un barrido y un registro nuevos.
5. **Reseña de Google** → recomendé mostrarla **a todos** y no solo a quien puntúa bien: ocultarla según la nota es *review gating* y va contra las políticas de Google. Si se quiere filtrar, encuesta primero y enlace después.
6. **Escala** → recomendé **1–5 estrellas** con comentario opcional y obligatorio solo en notas bajas (se agrega y se compara mejor que unas caritas).
7. **Dónde ve el taller las respuestas** → recomendé la **ficha de la orden más un indicador en el Inicio**, por coherencia con el acta y las garantías.

## 6. Estado al aplazarse

- **No se creó ninguna rama** y **no se tocó una sola línea de código** de la fase 23.
- La medición de §2 salió de leer el código (sin ejecutar migraciones ni tests).
- Cuando se retome: convertir esto en plan (spec + tareas), y decidir primero las dos cuestiones de §4 que
  arrastran todo lo demás — **dónde vive el token** y **si el enlace enseña fotos**.
