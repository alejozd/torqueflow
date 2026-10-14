# Traspaso para agentes e IAs — TorqueFlow

> Documento de traspaso. Está escrito para que **otra IA o otro agente** entienda en poco tiempo qué se
> hizo, cómo se hizo, qué no se puede romper y dónde está cada cosa. Si eres un agente recién llegado:
> lee esto completo **antes** de tocar código, y después lee los documentos que se citan en §9.
> Última actualización: 2026-10-14, tras el merge de la fase de consolidación (`dedc201`) y de sus arreglos
> posteriores al despliegue (`eee9992`).

---

## 1. Alcance: desde qué fase cubre este documento

El trabajo descrito aquí va **desde la Fase 21 hasta la Fase 24**, más una fase que quedó **aplazada**
(la 23) y la **fase de consolidación**, que corrigió lo que encontró la revisión de las fases 18–24. Nada anterior a la Fase 21 se detalla aquí: las fases 15 a 20 tienen su propio plan en
`docs/superpowers/plans/` y su resumen en `PROJECT_BRIEF.md`.

| Fase | Rama | Estado | Merge en `main` |
|---|---|---|---|
| 21 — recepción y garantías | `fase21-recepcion-garantias` | terminada | `65efee4` |
| 22 — flujo de taller | `fase22-flujo-taller` | terminada | `06f4aae` |
| 23 — portal del cliente | *(sin rama)* | **aplazada** (con DIAN) | — (documento `a9ea57f`) |
| 24 — mostrador y compras | `fase24-mostrador-compras` | terminada | `62924f8` |
| consolidación | `fase-consolidacion` | terminada | `dedc201` |
| arreglos tras desplegar | `fase-consolidacion-fix` | terminada | `eee9992` |

El brief de la 24 se registró en `b90c7e2`; el de la consolidación, justo después de su merge.

## 2. Estado actual (verificado, no supuesto)

- `main` con el merge de la consolidación (**`dedc201`**) y su brief encima, árbol limpio.
- **266 archivos de test / 2130 tests pasando**; `npx tsc --noEmit --incremental false` limpio; `eslint`
  limpio; `npm run build` OK.
- Base de datos (una sola, compartida entre el portátil de desarrollo y el servidor): `taller_dev` y
  `taller_dev_reference` con **todas las migraciones aplicadas**, incluidas las de las fases 21, 22 y 24 y la de la consolidación (`20261018120000_consolidacion`).
  La prueba de que la base coincide con el esquema es
  `TENANT_DATABASE_URL="<url del schema>" npx prisma migrate diff --from-url "<url del schema>" --to-schema-datamodel prisma/tenant/schema.prisma --script`
  respondiendo **"This is an empty migration"** (la variable hace falta: ver §7).
- El roadmap completo (fases 15–25 con sus ítems) está en
  `docs/superpowers/plans/2026-10-10-roadmap-modulos-faltantes.md`. Estado: **15–22 y 24 hechas, 23 aplazada,
  25 pendiente** (solo quedan sus ítems sueltos 25–28 y DIAN).

## 3. Cómo se trabaja en este repo (proceso obligatorio, no improvisar)

1. **Una rama por fase**: `faseN-<slug>` creada desde `main`. No se trabaja en `main` salvo documentación.
2. **Antes de codificar, un plan**: `docs/superpowers/plans/AAAA-MM-DD-faseN-<slug>.md`, autocontenido
   (objetivo, decisiones numeradas D1..Dn, modelo de datos, tareas, seguridad, verificación y cierre).
   Modelos a imitar: los planes de las fases 21, 22 y 24.
3. **Un commit por tarea**: `faseN-task X: …`, con push de la rama tras cada tarea. Commits de arreglos:
   `faseN-fix: …`.
4. **Verificación por tarea**: `npx tsc --noEmit --incremental false`, `npm test` completo y
   `npx eslint` en lo tocado. Se pega el resumen ("Test Files / Tests") en el reporte.
5. **TDD cuando hay lógica**: primero el test, verlo fallar, implementar, verlo pasar.
6. **Verificación final de la fase**: lo anterior + `npm run build`.
7. **Revisión independiente del diff completo** por otro modelo (solo lectura), y **fix round** de los
   hallazgos con sus tests. En la fase 24 esta revisión encontró fallos reales de dinero (ver §7), así que
   no es un trámite.
8. **Cierre, solo con aprobación explícita del usuario**: respaldo `pg_dump`, aplicar la migración a los
   dos schemas, `git merge --no-ff` a `main`, actualizar `PROJECT_BRIEF.md` y push.

Reglas duras del repo: `RULES.md` (no reintentos automáticos; nunca migrar sin respaldo y aprobación;
no tocar el backlog de otras fases a mitad de una fase). Los commits llevan
`Co-Authored-By: <modelo> <noreply@…>`.

## 4. Qué se hizo en cada fase

### Fase 21 — recepción y garantías (`65efee4`)
Diagrama de daños por zonas sobre una silueta que cambia según el tipo de vehículo; estado de ingreso
(kilometraje y combustible); **acta de entrega** imprimible con firma en pantalla o foto del papel, y
firmar + pasar a `ENTREGADA` en **una sola transacción** (porque `ENTREGADA` es inmutable); garantías por
línea cubierta (mano de obra o repuesto) con límite de fecha y/o kilometraje, consultables por vehículo.
Verificación: 239 archivos / 1915 tests, migración aplicada.

### Fase 22 — flujo de taller (`06f4aae`, brief `1f53faa`)
**Prioridad** de la orden (cuatro niveles, auditada al cambiar) que ordena la lista y cada columna del
tablero; el tablero kanban pasó de solo lectura a **accionable** (arrastrar y soltar nativo + menú
"mover a…" para teclado y táctil, ambos llamando la misma acción; nunca ofrece *Entregada* porque entregar
es firmar el acta; soltar en *Anulada* pide confirmación); **alerta de órdenes estancadas** (días sin
actividad, configurable) contando la orden **y** lo que se le carga (ítems, mano de obra, fotos, daños),
y alerta aparte de *terminadas sin entregar*. Verificación: 248 archivos / 1988 tests, migración aplicada.

### Fase 23 — portal del cliente (**aplazada**, documento `a9ea57f`)
Se midió antes de empezar y se decidió **no hacerla** junto con la facturación electrónica DIAN. Sería la
**primera superficie sin sesión**, la primera escritura anónima y la primera credencial almacenada con
expiración y revocación del proyecto (enlace público con token, encuesta posventa y reseña de Google).
La medición completa —hechos verificados, registro de riesgos con severidad, esfuerzo por bloques y las
**siete decisiones de producto que quedaron abiertas** con su recomendación— está en
`docs/superpowers/plans/2026-10-12-fase23-portal-cliente.md`. **No se creó rama ni una línea de código.**

### Fase 24 — mostrador y compras (`62924f8`, brief `b90c7e2`)
Tres cosas:

1. **Venta de mostrador**: documento propio (`VentaMostrador`, con sede obligatoria, número consecutivo y
   cliente opcional) porque `Factura.ordenId` es obligatorio y único y el arqueo llega a la sede por la
   orden. El stock se descuenta **con guarda (`stockActual >= cantidad`) y dentro de la misma transacción**
   que crea la venta, agregando las líneas repetidas. Sin cliente, la venta tiene que quedar pagada.
2. **Devoluciones**: documento propio, numerado y auditado (`VENTA_DEVOLVER`), que devuelve el dinero,
   reingresa el stock y, si la venta estaba a crédito, **baja primero la deuda** (solo el exceso sale del
   cajón, y el arqueo cuenta ese exceso, no el total devuelto).
3. **Cuentas por pagar**: nacen de la **entrada de mercancía** con `entradaId` único (imposible contarlas
   dos veces) mediante un único sincronizador compartido por los dos caminos que crean entradas; se saldan
   con abonos con guarda atómica; "pagada" siempre se deriva del saldo.
4. **Exportación**: cuatro reportes en `.xlsx` (cartera, cuentas por pagar, ventas del día y arqueos) desde
   rutas que toman **la sede de la sesión**, nunca de la URL.

Además, esta fase **cerró huecos heredados de caja**: cobrar una factura, registrar o devolver un anticipo,
y registrar (o marcar) un gasto pagado en efectivo **ahora exigen caja abierta**. Antes se registraban con
la caja cerrada y quedaban **fuera de todo arqueo** (porque el arqueo calcula su ventana por sede y fecha).
Los abonos a proveedor en efectivo entran al arqueo como egreso.

Verificación: 258 archivos / 2068 tests, migración `20261017120000_mostrador_compras` (7 tablas + un valor
de enum) aplicada a los dos schemas, con respaldo previo
`~/backups/torqueflow_20261013_1706_pre_fase24.sql` (405K, sha256 `3a9c636e87e5…`).

**Límite conocido de la fase 24**: la pantalla lista solo las ventas **de hoy**, así que una venta a crédito
de ayer no se puede cobrar ni devolver desde la interfaz (las acciones sí lo permiten).

### Fase de consolidación (`dedc201`, plan `docs/superpowers/plans/2026-10-13-fase-consolidacion.md`)
La revisión de las fases 18–24 encontró 1 hallazgo alto, 4 medios y varios bajos, y el usuario pidió quitar
fricción. Lo que cambió (los detalles y commits, en el §6 del plan):

1. **Dos opciones del taller** en Configuración (`ConfiguracionTaller.exigirActaFirmada` y `usarControlCaja`,
   las dos `false` por defecto; `src/lib/configuracion/opciones-taller.ts`).
2. **Entrega**: una orden facturada se entrega (A1); sin firma, si el taller no la exige (audita
   `ORDEN_ENTREGAR`), y el acta se puede firmar después.
3. **Caja**: una sola regla, `exigirCajaParaEfectivo` (ver §5). Mostrador solo ADMIN/RECEPCION, con precio y
   nombre del repuesto tomados del inventario (M2).
4. **Cuentas por pagar** con bloqueo `FOR UPDATE` y saldo = total − Σ abonos (M3). **Importación** con tope
   de 40 MB descomprimido, medido descomprimiendo de verdad (M4, `src/lib/importacion/zip-seguro.ts`).
5. Menores: B1 (anular vs pagar liquidación), B5 (cambio de estado condicional), B6 (permisos por URL), B7
   (borrado de archivos sin `..`).
6. **Tarjeta "Alertas del taller"** del Inicio: contadores por motivo enlazados al filtro, máximo 5 filas.
7. **Exportación** de ventas y arqueos con rango `?desde&hasta` (máx. 366 días, por defecto el mes en curso);
   `ventas-hoy` pasó a `ventas`.
8. **Liquidación simplificada** (diseño `2026-10-13-task10-liquidacion-simplificada.md`): la tabla es en vivo
   y el documento nace **al pagar** (foto + gasto en una transacción, ajuste en el diálogo de pago); anular
   borra el gasto y deja el periodo por pagar. Desaparecieron generar, reactivar, el ajuste aparte y el
   estado pendiente en el flujo. Los periodos cortan a medianoche de Bogotá (B2).

Verificación: 266 archivos / 2123 tests, `npm run build` OK, revisión del diff completo y fix round
(`29ad45e`). Migración aplicada a los dos schemas con respaldo
`~/backups/torqueflow_20261014_0002_pre_consolidacion.sql` (444 KB). La revisión final la hizo el mismo
agente que implementó la fase, no otro modelo (§3, paso 7).

**Arreglos tras desplegar** (`fase-consolidacion-fix`, merge `eee9992`, sin migración): el acta ya no dice
"Acta firmada." tras entregar sin firma ni deja abierta la confirmación de entregar; y **todos los cortes de
día y de mes pasaron a hora de Colombia**: el "hoy" del Inicio y del menú (cambiaba a las 7 p. m.), los
reportes, la vigencia de garantías, los arqueos del mes, las cotizaciones aprobadas del mes y la fecha de las
cuentas por pagar. La regla quedó en §7.

## 5. Invariantes que NO se pueden romper

- **El efectivo exige caja abierta cuando el taller usa el control de caja** (fase de consolidación, D3).
  La regla vive en **un solo sitio**: `exigirCajaParaEfectivo(tenantDb, sedeId, metodoOEfectivo, mensaje)` en
  `src/lib/caja/sesion.ts`; tarjeta, transferencia u otro nunca la exigen, y sin control de caja nada la
  exige. Si agregas un camino nuevo que mueve dinero, llama a esa función (no repitas la regla) **y**, si
  toca el cajón, súmalo al arqueo (`src/lib/caja/resumen.ts` + `cargarMovimientos` en
  `src/app/actions/caja-actions.ts`). Con control de caja, un gasto ya registrado no se pasa a efectivo.
- **El dinero se mueve con guardas atómicas dentro de una transacción**, nunca con un "leer y luego
  escribir": `stockActual: { gte: cantidad }`, `saldoPendiente: { gte: monto }`,
  `devueltoCantidad: { lte: vendida - cantidad }`. Los estados ("pagada") se **derivan** del saldo.
- **Multi-sede**: cada consulta usa `findFirst` + el scope correspondiente (`scopeOrden`, `scopeRepuesto`,
  `scopeFactura`, `scopeEntrada`, `scopeBodega`… de `src/lib/sede/scope.ts`); **nunca** `findUnique` por id
  suelto en una acción de usuario. La sede de la sesión es la única fuente de la sede.
- **Multi-tenant**: todo pasa por `getTenantDb(session.user.tenantSchema)` con `requireSession` /
  `requireRole` **antes** de leer o escribir. `getTenantDb(schema)` abre cualquier taller sin comprobar
  nada: el schema nunca puede venir de la URL o del formulario.
- **`src/proxy.ts` solo genera el nonce de CSP**: no autentica ni redirige. Cada ruta se protege sola; las
  páginas dentro de `(dashboard)` heredan el guard del layout, las de fuera (`/login`,
  `/seleccionar-sede`, las imprimibles) lo hacen por su cuenta.
- **Inmutabilidad de la orden**: `esOrdenMutable` / `assertOrdenMutable` (ENTREGADA, ANULADA y facturada no
  se tocan: ítems, mano de obra, cabecera). **El acta y la entrega no dependen de la factura**: una orden
  TERMINADA y facturada se entrega; la firma es obligatoria solo si el taller la exige.
- **Liquidaciones**: el documento nace al pagar y nunca se paga dos veces el mismo trabajo (bloqueo
  `FOR UPDATE` del técnico, índice único por técnico y periodo, escritura condicional a "no pagada" y
  guarda de solape entre frecuencias). El monto sale siempre del servidor.

## 6. Cómo se levanta y cómo se despliega

**En el portátil (desarrollo)**: `npm run dev` ya usa el puerto **3025** (`next dev -p 3025`), y `.env`
apunta a la base del servidor por Tailscale (`100.87.12.1`). Con Tailscale encendido, `http://localhost:3025`
funciona sin más. **Ojo**: esa base es la real del taller, así que lo que se pruebe ahí queda guardado.

**En el servidor (producción)**: la app vive en `/var/www/torqueflow`, se sirve en `127.0.0.1:3025` detrás
del proxy, y el dominio es `https://torqueflow.zdevs.uk/`. El despliegue correcto es **`sudo ./deploy.sh`**,
que hace en orden: `npm install`, los **dos** `prisma generate`, `npm run build`, `sudo pm2 restart torqueflow`
y `sudo pm2 status`.

**Errores de despliegue que ya nos costaron tiempo** (no repetirlos):

- Desplegar con `sudo git pull` + `sudo npm run build` + `sudo pm2 restart torqueflow` **a secas no sirve**:
  falta `npm install` (dos paquetes de Excel de la fase 20 nunca se instalaron y el build murió con
  `Module not found: Can't resolve 'read-excel-file/node'`) y falta `prisma generate` (el cliente quedó del
  9 de octubre, sin los modelos de la fase 24, y el build falla en la verificación de tipos). Un build a
  medias no deja `BUILD_ID` ni manifiestos, `next start` no arranca y el proxy devuelve **502**.
- Antes de recompilar, **borra `.next`** (`sudo rm -rf .next`) si hubo un intento fallido.
- En ese servidor la carpeta tiene archivos que quedaron de `root` por despliegues antiguos con `sudo`
  (318 archivos). Con el flujo todo-con-`sudo` no molestan; lo que **rompe** es mezclar: un `git pull` sin
  `sudo` en esa carpeta falla con "Permiso denegado" y deja el árbol mezclado. Elige un estilo y no lo mezcles.
- El build avisa de un `package-lock.json` en `/var/www` (fuera del repo). **No lo borres**: puede ser de
  otro proyecto del mismo servidor. Silenciarlo de raíz es una línea (`turbopack.root`) en `next.config.ts`.

**Migraciones** (solo con aprobación): respaldo primero, en el servidor, sin el parámetro de Prisma en la URL:

```bash
cd /var/www/torqueflow
set -a; . ./.env; set +a
pg_dump "${DATABASE_URL%%\?*}" > ~/backups/torqueflow_$(date +%Y%m%d_%H%M)_pre_faseNN.sql
```

Y desde el checkout que tenga la migración nueva, por cada schema:

```bash
TENANT_DATABASE_URL="${TENANT_DATABASE_BASE_URL}?schema=taller_dev" \
  npx prisma migrate deploy --schema=prisma/tenant/schema.prisma
```

Después, la comprobación que vale: `migrate diff` respondiendo **"This is an empty migration"**.

## 7. Trampas conocidas (lecciones que costaron tiempo)

- **Los tests mockean la base** (`getTenantDb`): si te falta una columna en la migración, **los tests siguen
  en verde**. Por eso el cierre exige comprobar contra la base real (`migrate diff` vacío).
- **`next dev` deja `.next/dev`** y un `npm run build` posterior falla con un error de tipos confuso
  (`TS2306 … validator.ts … is not a module`). Solución: `rm -rf .next` antes de compilar.
- **La revisión independiente de la fase 24 encontró fallos reales de dinero**: dos devoluciones
  simultáneas de la misma línea pagaban y reingresaban stock dos veces; un descuento mayor que el subtotal
  daba total negativo; y los abonos a proveedor en efectivo no entraban al arqueo. Todos corregidos con
  test. Moraleja: en este repo, cuando se toca dinero, la revisión no es opcional y los tests deben cubrir
  **la concurrencia**, no solo el camino feliz.
- **Tests de interfaz sensibles a la carga**: alguno supera el límite de 5 s de Vitest cuando la suite
  completa corre en paralelo (falla intermitente). Se arregla con `{ timeout: 20_000 }` en el test concreto.
- **`eslint` prohíbe `setState` dentro de un `useEffect`** (`react-hooks/set-state-in-effect`). Para vaciar
  un formulario tras una acción, usa el patrón de React de ajustar el estado durante el render (lo hace
  `src/app/(dashboard)/mostrador/carrito-mostrador.tsx`).
- **Video/Excel y CSV**: el proyecto exporta `.xlsx` con `write-excel-file` a través de
  `escribirLibro`/`leerLibro` de `src/lib/importacion/xlsx.ts` (**único** punto que habla con esas
  librerías). El CSV antiguo de citas no lleva BOM ni saneo de fórmulas: no se extiende.
- **`Pago` y `PagoProveedor` no tienen `sedeId`**: la sede se deduce por la factura (→ orden) o por la
  cuenta (→ entrada → bodega). Cualquier reporte de dinero tiene que hacer ese join o mezclará sedes.
- **`Factura.ordenId` es obligatorio y único**: una venta sin orden de trabajo no puede ser una factura.
- **Fechas: instante o solo día.** Colombia es UTC-5 fijo, sin horario de verano. Para **instantes**
  (`createdAt`, `entregadaAt`, `fechaHora`, `abiertaAt`) los días y meses cortan a medianoche de Bogotá:
  `buildRangoFechas` (`src/lib/reportes/rango-fechas.ts`), `rangoInstantesDelPeriodo` (gastos/periodo),
  `inicioDiaBogota`/`inicioMesBogota` y `formatoDiaBogota` (`src/lib/fecha-bogota.ts`). Las columnas de
  **solo día** (`@db.Date`: `Gasto.fecha`, `Garantia.cubreHasta`, `CuentaPorPagar.fecha`, SOAT y
  tecnomecánica) Prisma las maneja como medianoche UTC: se filtran con `buildRangoDias` /
  `rangoDelPeriodo` de gastos, se muestran con `timeZone: "UTC"`, y para guardar "el día de hoy" se usa
  `new Date(\`${formatoDiaBogota.format(instante)}T00:00:00.000Z\`)`, nunca el instante directo. Con UTC en
  un instante, lo de después de las 7 p. m. cae en el día siguiente.
- **`migrate diff --to-schema-datamodel` lee el schema de `TENANT_DATABASE_URL`**: sin esa variable compara
  contra `public` y escupe el script de creación completo, que parece un desfase y no lo es. Defínela con la
  misma URL que `--from-url`.
- **Mocks de `findMany` que ignoran el `where`**: si la acción confía en que la base filtra (por ejemplo
  `estado: "PAGADA"`), el mock tiene que aplicar el mismo filtro o el test prueba otra cosa (pasó en la
  liquidación simplificada).
- **`$queryRaw` dentro de una transacción del taller** resuelve el schema por el `search_path` de su URL: los
  nombres de tabla van sin calificar (`SELECT id FROM usuarios WHERE id = … FOR UPDATE`).
- Pendiente conocido (reportado, no arreglado): el formulario de login sin hidratar cae en un GET nativo y
  deja las credenciales en la URL/registros. Está en el backlog; no se tocó.

## 8. Pendientes y próximos pasos

- **Fase 23**: aplazada junto con DIAN. Para retomarla, sus siete decisiones están en su documento (§4).
- **Fase 25**: quedan los ítems sueltos del roadmap — 25 flotas/clientes empresa, 26 asistente IA,
  27 consulta RUNT, 28 exportación contable — y **la facturación electrónica DIAN**, que se planea aparte.
  Se midió una versión corta ("exportación contable + la parte barata de flotas"): serían **5 tareas** si se
  captura el IVA descontable (el que hoy no existe: `Gasto` y las entradas no registran impuesto, y el IVA
  solo se guarda a nivel de documento en `Factura`/`VentaMostrador`) o **4 tareas** si el libro de IVA cubre
  solo el generado. El usuario pidió **pausar** antes de decidir.
- **Ítem 21 (horas por técnico)**: se aplazó en la fase 19 y nunca se asignó a una fase; es pequeño y encaja
  con la liquidación que ya existe.

## 9. Mapa: dónde está cada cosa

| Qué | Dónde |
|---|---|
| Resumen del proyecto y de cada fase | `PROJECT_BRIEF.md` |
| Reglas duras de trabajo | `RULES.md` |
| Despliegue | `docs/DEPLOY.md` |
| Roadmap y fases 15–25 | `docs/superpowers/plans/2026-10-10-roadmap-modulos-faltantes.md` |
| Plan/medición de una fase | `docs/superpowers/plans/AAAA-MM-DD-faseN-<slug>.md` (21, 22, 23, 24 y `2026-10-13-fase-consolidacion.md`) |
| Caja y arqueo | `src/lib/caja/{resumen,sesion}.ts`, `src/app/actions/caja-actions.ts` |
| Mostrador | `src/app/(dashboard)/mostrador/*`, `src/app/actions/venta-mostrador-actions.ts`, `src/app/actions/devolucion-mostrador-actions.ts` |
| Cuentas por pagar | `src/app/(dashboard)/cuentas-por-pagar/*`, `src/app/actions/cuenta-por-pagar-actions.ts`, `src/lib/proveedores/*` |
| Exportación | `src/app/api/exportar/[reporte]/route.ts`, `src/lib/exportacion/{reportes,rango-fechas,consultas}.ts`, `src/components/{boton-exportar,exportar-con-rango}.tsx` |
| Opciones del taller | `src/lib/configuracion/opciones-taller.ts`, `src/app/actions/configuracion-taller-actions.ts`, `src/app/(dashboard)/configuracion-smtp/opciones-taller-form.tsx` |
| Liquidaciones | `src/app/actions/liquidacion-actions.ts`, `src/lib/liquidaciones/*`, `src/app/(dashboard)/liquidaciones/*` |
| Excel (único punto) | `src/lib/importacion/xlsx.ts` |
| Esquema del taller y migraciones | `prisma/tenant/schema.prisma`, `prisma/tenant/migrations/` |
| Auditoría | `src/lib/auditoria/catalogo.ts` (+ el enum en el schema: hay que tocar los dos) |

## 10. Si retomas: lista de comprobación

1. Lee `RULES.md`, `PROJECT_BRIEF.md` y el plan de la fase que vas a tocar.
2. `git log --oneline -15` en `main` y `git status`: ¿está limpio? ¿en qué fase quedó?
3. `npx tsc --noEmit --incremental false` y `npm test`: ¿todo en verde antes de empezar?
4. Crea la rama `faseN-<slug>` desde `main` y escribe el plan **antes** de codificar.
5. Trabaja tarea por tarea con su commit y su verificación; no mezcles tareas ni estilos de despliegue.
6. Al cerrar: verificación final, revisión independiente, fix round, y **pide aprobación** para respaldar,
   migrar y mezclar.

## 11. Prompt sugerido para otra IA

Cópialo tal cual al abrir una sesión nueva:

```
Estás trabajando en el repositorio C:\Proyectos\torqueflow (TorqueFlow: SaaS multi-tenant de talleres,
Next.js 16 + Prisma 6 + Postgres con un schema por taller, Vitest, Tailwind v4).

Antes de escribir una sola línea de código, lee en este orden:
1. docs/TRASPASO-AGENTES.md   ← estado, proceso obligatorio, invariantes y trampas conocidas
2. RULES.md                   ← reglas duras (no reintentos, migraciones con respaldo y aprobación)
3. PROJECT_BRIEF.md           ← qué hace el producto y qué se hizo en cada fase
4. docs/superpowers/plans/    ← el plan de la fase que vayas a tocar (y el roadmap 2026-10-10)

Trabaja como se describe en el traspaso: rama propia por fase, plan escrito antes de codificar,
un commit por tarea con su verificación (tsc --noEmit --incremental false, eslint y npm test),
verificación final con npm run build, revisión independiente del diff y fix round, y cierre
(respaldo, migración a taller_dev y taller_dev_reference, merge --no-ff a main, brief y push)
solo con aprobación explícita.

No toques el backlog de otras fases ni cambies el flujo de despliegue sin avisar.
```
