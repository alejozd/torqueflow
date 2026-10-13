# Fase 20 — Importar desde Excel: clientes, vehículos, repuestos y servicios (spec + plan de tareas)

> Rama: `fase20-importar-excel` · Roadmap ítem **9** ("Importar desde Excel", prioridad alta).
> Depende de las fases **15** (vehículo completo: VIN, SOAT, tecnomecánica) y **18** (catálogo de
> servicios), ambas ya en `main`. Documento **autocontenido**: puede ejecutarlo cualquier agente
> (Claude, DeepSeek, etc.) sin el historial de la conversación. Leer completo antes de empezar.
> **Estado: plan escrito, NO ejecutado.** Empezar por la Task 1.

---

## 0. Instrucciones para el agente ejecutor (OBLIGATORIAS)

1. Leer antes de tocar código: `AGENTS.md` (este Next.js 16 tiene cambios incompatibles: consultar
   `node_modules/next/dist/docs/` antes de usar APIs de Next), `RULES.md` y `PROJECT_BRIEF.md`.
2. Trabajar **solo** en la rama `fase20-importar-excel`. No tocar `main`.
3. **Una tarea a la vez.** Al terminar cada tarea:
   - `npx tsc --noEmit` limpio y `npm test` completo pasando (pegar el resumen "Test Files / Tests").
   - `npx eslint <archivos tocados>` sin errores.
   - Commit `fase20-task N: <descripción>` con trailer `Co-Authored-By: <modelo que ejecuta> <noreply@...>`; `git push`.
   - Reportar en 3–5 líneas (qué se hizo, hash, tests) y **detenerse a pedir aprobación**, salvo que el
     usuario autorice explícitamente continuar sin aprobación por tarea (como en la fase 19): en ese
     caso se reporta al final de todas.
4. **No reintentos automáticos** (RULES §1): máximo 1 corrección por error; si vuelve a fallar,
   detenerse y reportar.
5. **Nunca aplicar migraciones a ninguna base de datos.** Esta fase **no necesita migración** (ver D8);
   la única base del `.env` (`100.87.12.1`) es **la misma de producción**.
6. TDD: escribir primero los tests, verlos fallar, implementar, verlos pasar.
7. Archivos con finales de línea CRLF: preferir edición por reemplazo exacto, no `sed`.
8. Español en toda la UI y en los mensajes de validación (los planes de fase van en español; los
   comentarios de `src/` van en inglés, como el resto del repo).
9. **Instalar dependencias** (Task 1) requiere red: `npm install read-excel-file write-excel-file`.
   Actualiza `package.json` y `package-lock.json`; es el único cambio de dependencias de la fase.
10. Sandbox confinado (p. ej. el agente DSH en modo `workspace-write`): `npx tsc --noEmit` falla con
    `TS5033` al escribir `tsconfig.tsbuildinfo` → usar `npx tsc --noEmit --incremental false`.
    `npm test`, `npm run build`, `npm install` y `npx prisma …` **no** arrancan en modo confinado
    (lanzan subprocesos con pipes: `spawn EPERM`), así que requieren acceso completo o ejecutarlos el
    usuario; **no son fallos del proyecto**.

### Patrones del proyecto a reutilizar (leerlos)

- **Subida de archivo por server action (el único precedente)**: `addDviFotoAction`
  (`src/app/actions/dvi-actions.ts:68-121`, exige `file instanceof File && file.size > 0`) y su
  formulario `src/app/(dashboard)/dvi/dvi-foto-form.tsx:31-77` (`useActionState`, `<form noValidate>`,
  `Button disabled={isPending}`, error con `<Alert variant="destructive">`, éxito con `role="status"`).
  **No** reutilizar `saveDviFoto` (`src/lib/storage/local-file-storage.ts`): su allowlist es de imágenes
  y valida *magic bytes*; un `.xlsx` es un ZIP y no pasa.
- **Route handler con sesión**: `src/app/api/uploads/[...path]/route.ts:18` llama `requireSession()`
  dentro de un `GET`. Es el precedente de la descarga de la plantilla (Task 2).
- **Tope de subida ya configurado**: `next.config.ts:7-11` →
  `experimental.serverActions.bodySizeLimit: "6mb"` (por defecto 1 MB). No hay que tocarlo, pero es el
  techo real de la subida y hay que validarlo antes (D7).
- **Esquemas Zod a reutilizar tal cual, fila por fila** (ninguno conoce número de fila/columna, así que
  el import mapea `error.issues` → (fila, columna)): `clienteInputSchema`
  (`src/lib/validation/cliente.ts:3-8`), `vehiculoInputSchema`
  (`src/lib/validation/vehiculo.ts:34-54`, con la regla de VIN y `placaFormatoHabitual`),
  `repuestoInputSchema` + `conStockMaximoValido` + `repuestoStockInicialSchema`
  (`src/lib/validation/inventario.ts:30-70`; **regla explícita en `:49-52`: validar con
  `conStockMaximoValido`, nunca con el base**) y `servicioInputSchema`
  (`src/lib/validation/servicio.ts:18-34`).
- **Dinero**: `requiredMoney` / `vacioComoUndefined` (`src/lib/validation/money.ts:8-14`) y `roundMoney`
  (`src/lib/money/round.ts:8-10`) antes de convertir a `Decimal(10,2)`.
- **Bodega de la sede activa**: `scopeBodega` y su mensaje `BODEGA_AJENA`
  (`src/lib/sede/scope.ts:34-36`, usado en `src/app/actions/repuesto-actions.ts:50,141-147`).
- **Selectores ya existentes para el formulario**: `listBodegas()` (`src/app/actions/bodega-actions.ts:25`)
  y `listProveedores()` (`src/app/actions/proveedor-actions.ts:34`).
- **Entrada de mercancía (stock inicial)**: `crearEntradaMercanciaAction`
  (`src/app/actions/entrada-mercancia-actions.ts:60-150`; el incremento de stock está en `:143`) y el
  modelo `EntradaMercancia` + `EntradaMercanciaItem` (`prisma/tenant/schema.prisma:472-503`).
- **Orden de dependencias de una siembra masiva**: `scripts/seed-clientes.ts:74-124` (dedupe por
  `documento`) y `scripts/seed-repuestos.ts:90-151` (resuelve la bodega, escribe stock inline).
- **Tabla de resultados**: `src/components/data-table.tsx` (+ `data-table-interactive.tsx`),
  `src/components/ui/select-field.tsx`, `src/components/ui/alert.tsx`.
- **Menú**: `src/app/(dashboard)/dashboard-sidebar.tsx` (grupo `Administracion`).

---

## 1. Objetivo y decisiones

**Objetivo:** que un taller que hoy vive en Excel (o que migra desde otro sistema) cargue de una sola
vez sus clientes, vehículos, repuestos y servicios, sin que el asistente tenga que escribir fila por
fila, y sabiendo exactamente qué entró, qué ya existía y qué quedó por fuera y por qué.

**Fuera de alcance de esta fase** (documentarlo, no improvisarlo): importar kits de servicio
(`ServicioRepuesto`), proveedores, órdenes históricas, facturas, usuarios; actualizar/sobrescribir
registros existentes; programar importaciones o vigilar una carpeta; CSV (D1); límites de plan por
clientes/repuestos (hoy no existen: `src/lib/planes/limites.ts:3-6` solo tiene `maxUsuarios`/`maxSedes`).

| # | Decisión |
|---|---|
| **D1** | **Formato: libro `.xlsx` con una hoja por entidad** (más la hoja `Instrucciones`). Un solo archivo puede traer las cuatro hojas; las que no estén se ignoran. Se descarta CSV: Excel en español (tildes, ñ, separador `;`) es la fuente real de estos datos. Dependencias nuevas: `read-excel-file` + `write-excel-file` (ver Task 1 y la nota de librerías). |
| **D2** | **Solo crea.** Una fila cuya clave ya existe (en la base o repetida dentro del mismo archivo) **no se toca**: se cuenta y se reporta como "ya existía", con su clave. Nada se sobrescribe sin querer; reimportar el mismo archivo es inofensivo. |
| **D3** | **Importa lo válido y reporta lo rechazado**: cada fila rechazada se devuelve con `hoja`, número de fila (el de Excel, contando el encabezado), columna y motivo en español. Las filas buenas de esa misma hoja sí entran. |
| **D4** | **Las cuatro entidades**: `Clientes`, `Vehículos`, `Repuestos`, `Servicios`, en ese orden de dependencias (un vehículo necesita su cliente; un repuesto necesita bodega). |
| **D5** | **Repuestos: catálogo + stock inicial.** `bodegaId` es obligatorio en el modelo (`schema.prisma:455-456`) y debe ser de la sede activa, así que el formulario **pide la bodega siempre**; si el archivo trae `cantidad inicial`, se pide también un **proveedor** y el stock entra por la vía trazable: se crea el repuesto con `stockActual: 0` y, para las filas con cantidad, **una sola** `EntradaMercancia` con un `EntradaMercanciaItem` por repuesto + `stockActual: { increment }` (misma semántica que `crearEntradaMercanciaAction`; ver D17 del fix round). Sin proveedor elegido, las filas con cantidad se rechazan con ese motivo (y el resto entra). |
| **D6** | **Claves de duplicado** (todas normalizadas: minúsculas, sin tildes, sin espacios de sobra): Clientes → `documento` si viene, si no `nombre`; Vehículos → `placa` (mayúsculas, sin espacios ni guiones); Repuestos → `codigo` (mayúsculas); Servicios → `nombre`. Solo `placa`, `codigo` y `nombre` de servicio son únicos en la base; el de clientes es un dedupe de aplicación, igual que en `scripts/seed-clientes.ts:88-95`. |
| **D7** | **Topes explícitos y avisados**: archivo ≤ **5 MB** (por debajo del `bodySizeLimit: "6mb"`), ≤ **2.000 filas por hoja** (las que sobren se reportan como rechazadas), y el reporte devuelve como máximo **200 rechazos** visibles (el resto se cuenta: "y N más"). |
| **D8** | **Esta fase no lleva migración ni evento de auditoría.** Todo lo que crea ya existe en el esquema y la importación es **aditiva** (no borra ni modifica nada); la casa solo audita acciones destructivas y de dinero (`bodega-actions.ts:124-136` es el patrón). Se reevalúa si más adelante la importación puede actualizar. |
| **D9** | **Roles**: la página y la action piden `ADMIN` **o** `RECEPCION` (clientes, vehículos y repuestos son de recepción: `cliente-actions.ts:142`, `vehiculo-actions.ts:65`, `repuesto-actions.ts:138`). La hoja **Servicios es solo de ADMIN** (`servicio-actions.ts:208`): si un RECEPCION sube el libro, esa hoja se **omite** y el reporte lo dice, en vez de rechazar fila por fila. |
| **D10** | **Excel en español, normalizado antes de Zod**: encabezados con tildes/mayúsculas/espacios (`Teléfono` = `telefono`), números con coma decimal y separador de miles (`"1.500,50"` → `1500.5`), fechas `dd/mm/aaaa`, `aaaa-mm-dd`, objeto `Date` o número de serie de Excel, y `sí/no` para booleanos. La normalización vive aparte de Zod (D3 y Task 1): los esquemas existentes se reutilizan **después** de normalizar. |
| **D11** | **Una transacción por hoja, hojas independientes.** Si la escritura de una hoja falla (p. ej. una carrera que provoca `P2002`), esa hoja no entra y se reporta como error de hoja con mensaje propio; las hojas anteriores ya importadas se quedan (el orden de D4 garantiza que las dependencias estén). |
| **D12** | **La placa se guarda como la escribió el taller** (solo `trim`): el formato no se impone en ningún otro sitio (`placaFormatoHabitual` es un aviso no bloqueante, `vehiculo.ts:24-32`), y reformatearla crearía inconsistencias con lo que ya hay. Para comparar duplicados sí se normaliza (mayúsculas, sin espacios ni guiones). |

---

## 2. Contrato de las hojas (Task 1) y modelo

**No hay cambios de esquema.** El contrato de columnas es un módulo puro, `src/lib/importacion/hojas.ts`,
que es la **única fuente de verdad**: lo consumen el generador de la plantilla, el lector de la subida y
los tests, así que la plantilla y el parser no pueden divergir.

Nombres de hoja (se comparan normalizados, así que `Vehículos` = `Vehiculos`): `Clientes`, `Vehículos`,
`Repuestos`, `Servicios`, `Instrucciones`. La plantilla se escribe con las tildes correctas.

### Clientes (aliases entre paréntesis; obligatorias en negrita)

| Columna | Aliases | Obligatoria | Normalización / validación | Ejemplo |
|---|---|---|---|---|
| **Nombre** | nombre, cliente | sí | texto, `trim`, espacios colapsados (`clienteInputSchema`) | María Pérez |
| Documento | documento, nit, cedula, cédula, cc | no | texto `trim` (se guarda tal cual; para comparar: sin puntos ni espacios) | 1.020.456.789 |
| Teléfono | telefono, celular, whatsapp | no | texto `trim` | 310 555 1234 |
| Correo | email, correo, correo electronico, e-mail | no | texto `trim` en minúsculas; `z.email` de `clienteInputSchema` | maria@correo.com |

### Vehículos

| Columna | Aliases | Obligatoria | Normalización / validación | Ejemplo |
|---|---|---|---|---|
| **Placa** | placa, matricula, patente | sí | `trim`; para comparar mayúsculas sin espacios ni guiones | ABC123 |
| **Marca** | marca | sí | texto `trim` | Renault |
| **Modelo** | modelo, linea | sí | texto `trim` | Logan |
| Documento cliente | documento cliente, documento, cedula, nit | una de las dos | igual que en Clientes | 1.020.456.789 |
| Nombre cliente | nombre cliente, cliente | una de las dos | igual que en Clientes | María Pérez |
| Tipo | tipo, clase | no | `CARRO` \| `MOTO` (por defecto `CARRO`) | CARRO |
| Año | anio, año | no | entero 1900–2100 | 2021 |
| Kilometraje | kilometraje, km, kms | no | entero ≥ 0 | 85000 |
| Color | color | no | texto | Gris |
| VIN | vin, chasis, numero de chasis | no | 17 caracteres sin I/O/Q (`MENSAJE_VIN_INVALIDO`) | 9BD… |
| Combustible | combustible | no | `TipoCombustible` (español, como el formulario) | GASOLINA |
| Transmisión | transmision, caja | no | `TipoTransmision` | MANUAL |
| SOAT vence | soat vence, soat, vencimiento soat | no | fecha | 15/03/2027 |
| Tecnomecánica vence | tecnomecanica, tecnomecanica vence, rtm | no | fecha | 20/11/2026 |
| Observaciones | observaciones, notas | no | texto | Cliente frecuente |

**Resolución del cliente** (la hace la Task 3): primero por documento normalizado, después por nombre
normalizado, **mirando tanto la base como las filas creadas en esta misma corrida desde la hoja
`Clientes`** (por eso el orden de D4). Si no aparece: fila rechazada con
`No encontré ese cliente en el sistema ni en la hoja de Clientes de este archivo`.

### Repuestos

| Columna | Aliases | Obligatoria | Normalización / validación | Ejemplo |
|---|---|---|---|---|
| **Código** | codigo, sku, referencia, cod | sí | `trim`; para comparar mayúsculas | FIL-001 |
| **Nombre** | nombre, repuesto | sí | texto `trim` | Filtro de aceite |
| Descripción | descripcion, observaciones | no | texto | Filtro de aceite motor 1.6 |
| **Precio compra** | precio compra, costo, precio costo | sí | dinero ≥ 0, `Decimal(10,2)` | 12.500,00 |
| **Precio venta** | precio venta, precio, pvp | sí | dinero ≥ 0, `Decimal(10,2)` | 25.000,00 |
| Stock mínimo | stock minimo, minimo, min | no | entero ≥ 0 (por defecto 0) | 5 |
| Stock máximo | stock maximo, maximo, max | no | entero ≥ 0, mayor que el mínimo (`conStockMaximoValido`) | 20 |
| Múltiplo compra | multiplo compra, multiplo, empaque | no | entero ≥ 1 (por defecto 1) | 1 |
| Cantidad inicial | cantidad inicial, stock inicial, cantidad, stock | no | entero ≥ 0 (por defecto 0 → sin entrada) | 10 |

La **bodega** y el **proveedor** no van en la hoja: se eligen en el formulario (D5), para que un archivo
no pueda meter repuestos en otra sede por accidente.

### Servicios

| Columna | Aliases | Obligatoria | Normalización / validación | Ejemplo |
|---|---|---|---|---|
| **Nombre** | nombre, servicio | sí | texto `trim` ≤ 80, único sin distinguir mayúsculas | Cambio de aceite |
| Descripción | descripcion, detalle | no | texto ≤ 300 | Incluye filtro y revisión |
| **Precio mano de obra** | precio mano de obra, precio, valor, mano de obra | sí | dinero ≥ 0 ≤ 99.999.999,99 | 45.000 |
| Activo | activo | no | `sí/no` (por defecto sí) | sí |

Los **kits** (`ServicioRepuesto`) no se importan en esta fase (fuera de alcance, §1).

### Librerías (por qué estas y no `exceljs`)

`read-excel-file` y `write-excel-file` (mismo autor, versiones actuales: `9.3.12` y `4.1.1`): ESM con
puntos de entrada separados `node`/`browser`, `engines: node >= 18`, 4 y 1 dependencias modernas
(`saxen`, `fflate`, `worker-f`, `unzipper-esm`) y publicación reciente. `exceljs@4.4.0` es de octubre de
2023, pesa 21 MB descomprimido y arrastra 10 dependencias antiguas (`archiver@5`, `unzipper@0.10`,
`uuid@8`), superficie que no necesitamos para generar una plantilla y leer un archivo del usuario.
La validación sigue siendo nuestra (Zod), así que la librería **solo** entrega matrices de celdas.

---

## 3. Tareas

### Task 1: dependencias, contrato de hojas y normalización (lógica pura)

**Archivos:** `package.json`, `package-lock.json`, `src/lib/importacion/hojas.ts`,
`src/lib/importacion/normalizar.ts` (+ `hojas.test.ts`, `normalizar.test.ts`).

1. `npm install read-excel-file write-excel-file` (una sola vez; anotar el resultado en el reporte).
2. `hojas.ts`: tipo `ColumnaHoja { clave, encabezado, aliases, obligatoria, ejemplo, tipo }`,
   `HojaContrato { nombre, nombreVisible, columnas, claveDuplicado, nota }` y `HOJAS: HojaContrato[]`
   con las cuatro hojas de §2; `buscarHojaPorNombre(nombre)` y `resolverColumnas(encabezados)` (empareja
   encabezados reales con columnas del contrato por alias normalizado y devuelve las obligatorias que
   faltan). Constantes: `MAX_FILAS_POR_HOJA = 2000`, `MAX_RECHAZOS_VISIBLES = 200`,
   `MAX_BYTES_ARCHIVO = 5 * 1024 * 1024`.
3. `normalizar.ts` (puro, sin dependencias nuevas): `normalizarEncabezado` (trim, minúsculas, sin
   tildes, sin espacios/guiones/guiones bajos ni BOM), `normalizarTexto` (trim + espacios colapsados),
   `normalizarClave` (texto normalizado para comparar), `normalizarNumero` (acepta `"1.500,50"`,
   `"1500,5"`, `"1500.50"`, `"$ 1.500"`, número; devuelve `number | null`), `normalizarEntero`,
   `normalizarFecha` (`dd/mm/aaaa`, `d/m/aa`, `aaaa-mm-dd`, `Date`, serie de Excel), `normalizarBooleano`
   (`sí/no/si/true/false/x/1/0`) y `normalizarPlaca` / `normalizarCodigo` (mayúsculas, sin espacios ni
   guiones). Cada función documenta en una línea por qué existe (D10).
4. Tests: números en formato colombiano y con basura (`"abc"` → `null`), fechas en los cinco formatos
   (incluida la serie de Excel y una fecha inválida como `31/02/2026` → `null`), encabezados con
   tildes/BOM/mayúsculas, booleanos, placas y códigos; y que `resolverColumnas` detecte faltantes
   obligatorias y no confunda `precio compra` con `precio venta` ni `nombre cliente` con `nombre`.
5. Verificar (§0.3), commit `fase20-task 1: dependencias, contrato de hojas y normalizacion`, **pedir aprobación**.

### Task 2: leer el `.xlsx` y generar la plantilla

**Archivos:** `src/lib/importacion/xlsx.ts` (+ `xlsx.test.ts`),
`src/app/api/importacion/plantilla/route.ts`, `src/lib/importacion/plantilla.ts` (+ `plantilla.test.ts`).

1. `xlsx.ts` es el **único** archivo que importa las librerías: `leerLibro(datos: ArrayBuffer | Buffer)`
   → `{ hojas: { nombre, filas: unknown[][] }[] }` y `escribirLibro(libro)` → `Buffer`. Verificar
   empíricamente qué punto de entrada acepta un `File` de `FormData` en un server action (`/universal`
   trabaja con `Blob`; `/node` con `Buffer`/stream) y dejar escrito el que funcione con un test que
   construya el libro con `escribirLibro`, lo convierta en `File` y lo vuelva a leer con `leerLibro`
   (ida y vuelta real, no mockeada).
2. `plantilla.ts`: `construirPlantilla()` → libro con las cuatro hojas del contrato (encabezados con
   tilde, fila de ejemplo, ancho de columna, y las columnas obligatorias marcadas) + hoja
   `Instrucciones` con: qué hace cada hoja, que las columnas obligatorias están marcadas, que los
   números van en formato colombiano, que las fechas se aceptan como `dd/mm/aaaa`, que **nada se
   sobrescribe** y que los repuestos se cargan en la bodega elegida al subir el archivo.
3. `route.ts` (`GET`): `requireRole(["ADMIN", "RECEPCION"])` (mismo patrón que
   `src/app/api/uploads/[...path]/route.ts:18`), responde el `.xlsx` con
   `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y
   `Content-Disposition: attachment; filename="plantilla-importacion-torqueflow.xlsx"`. Sin caché.
4. Tests: la plantilla tiene las cinco hojas y los encabezados exactos del contrato; **ida y vuelta**
   (`construirPlantilla` → `leerLibro` → `resolverColumnas` no reporta faltantes); el route handler
   exige rol y devuelve el tipo MIME y el nombre de archivo.
5. Verificar (§0.3), commit `fase20-task 2: lectura de xlsx y plantilla descargable`, **pedir aprobación**.

### Task 3: validación por fila, dependencias y duplicados (lógica pura)

**Archivos:** `src/lib/importacion/lectura.ts`, `src/lib/importacion/validacion.ts`,
`src/lib/importacion/duplicados.ts`, `src/lib/importacion/resultado.ts` (+ un test por archivo).

1. `lectura.ts`: de `unknown[][]` a filas nombradas — detecta la fila de encabezado (la primera no
   vacía), ignora filas totalmente vacías, corta en `MAX_FILAS_POR_HOJA` contando las sobrantes como
   rechazadas, y devuelve `{ filas: { numeroFila, valores }[], rechazos }` con el número de fila real de
   Excel.
2. `validacion.ts`: por entidad, normaliza (Task 1) → arma el objeto → lo pasa por el esquema Zod
   existente (`clienteInputSchema`, `vehiculoInputSchema`, `repuestoInputSchema` +
   `conStockMaximoValido` + `repuestoStockInicialSchema`, `servicioInputSchema`) → mapea cada
   `error.issues` a `{ hoja, fila, columna, valor, motivo }` usando el contrato para traducir el path de
   Zod a la columna de la plantilla. Reglas propias: vehículo sin cliente resoluble (ver §2),
   `cantidad inicial > 0` sin proveedor elegido, y hoja de Servicios sin rol ADMIN.
3. `duplicados.ts`: `clavesExistentes(tenantDb, hoja)` (una sola consulta por hoja: `findMany` de
   `select` mínimo) + duplicados dentro del archivo; devuelve `crear | existente | repetida`.
4. `resultado.ts`: `ResultadoImportacion { error, resumen: ResumenHoja[], rechazos, rechazosOcultos }` con
   `resumir(...)` y el recorte a `MAX_RECHAZOS_VISIBLES`.
5. Tests: fila con VIN inválido, precio `"abc"`, stock máximo menor que el mínimo, fecha `31/02/2026`,
   correo inválido, año 1800; vehículo que resuelve su cliente por documento y por nombre, cliente creado
   **en el mismo archivo**, cliente inexistente; duplicado contra la base y repetido en el archivo; tope
   de filas y de rechazos visibles.
6. Verificar (§0.3), commit `fase20-task 3: validacion por fila, dependencias y duplicados`, **pedir aprobación**.

### Task 4: la server action de importación

**Archivos:** `src/app/actions/importacion-actions.ts` (+ `importacion-actions.test.ts`).

1. `importarAction(prevState, formData)`: `requireRole(["ADMIN", "RECEPCION"])` → `getTenantDb` →
   archivo (`file instanceof File`, ≤ `MAX_BYTES_ARCHIVO`, extensión `.xlsx`) → `leerLibro` →
   `importarLibro(...)` con las hojas en el orden de D4 dentro de **una transacción por hoja**
   (`tenantDb.$transaction(async (tx) => …)`, nunca `createMany`) → `revalidatePath` de `/clientes`,
   `/vehiculos`(si existe), `/repuestos`, `/servicios`, `/importar`.
2. Detalles que la action debe resolver: `bodegaId` con `scopeBodega` (mensaje `BODEGA_AJENA`),
   `proveedorId` validado contra la sede activa, repuesto creado con `stockActual: 0` y
   `EntradaMercancia` + item + `increment` cuando hay cantidad (D5), `proveedor` inexistente/sin
   elegir → rechazo de esa fila con motivo, y **una hoja que falla en la escritura no tumba las
   anteriores** (D11) devolviendo `estado: "error"` con `friendlyPrismaErrorMessage`.
3. Errores de datos como estado, no excepciones (patrón de la casa): `{ error, resumen, rechazos,
   rechazosOcultos }`; el error de cabecera solo para fallos globales (sin archivo, archivo enorme,
   archivo ilegible, sin bodega elegida).
4. Tests (BD mockeada, `FormData` + `File` reales como en `dvi-actions.test.ts:139-143`): exige rol;
   rechaza archivo > 5 MB y archivo ilegible; crea clientes y luego sus vehículos resolviendo el cliente
   recién creado; omite existentes sin re-crearlos ni pisarlos; crea repuestos con y sin cantidad inicial
   (esta última con `EntradaMercancia` + `increment`); rechaza bodega de otra sede; un `P2002` en
   repuestos deja clientes/vehículos ya importados y marca esa hoja como error; RECEPCION no importa
   servicios; el reporte respeta el tope de rechazos visibles.
5. Verificar (§0.3), commit `fase20-task 4: accion de importacion con reporte por fila`, **pedir aprobación**.

### Task 5: página de importación

**Archivos:** `src/app/(dashboard)/importar/page.tsx`, `loading.tsx`, `importar-form.tsx`,
`reporte-importacion.tsx` (+ `importar-form.test.tsx`, `reporte-importacion.test.tsx`,
`page.test.tsx`), `src/app/(dashboard)/dashboard-sidebar.tsx`.

1. Página `/importar` (grupo `Administración`, icono propio; visible solo a ADMIN/RECEPCION): título,
   explicación de tres o cuatro líneas, **enlace de descarga de la plantilla**
   (`/api/importacion/plantilla`), el formulario y — cuando hay resultado — el reporte.
2. `importar-form.tsx` (cliente, `useActionState` como `dvi-foto-form.tsx`): `input type="file"
   accept=".xlsx"`, `SelectField` de bodega (obligatorio, `listBodegas()`), `SelectField` de proveedor
   (opcional, con la ayuda "necesario si la hoja de Repuestos trae cantidad inicial"), botón
   `disabled={isPending}` con "Importando…", error con `Alert` destructivo, y una advertencia visible de
   que **nada se sobrescribe**.
3. `reporte-importacion.tsx`: resumen por hoja (leídas, creadas, ya existían, rechazadas, omitidas, error)
   con `DataTable` para los rechazos (columnas Hoja, Fila, Columna, Valor, Motivo), el aviso de
   "y N rechazos más" cuando aplica, y estado vacío honesto cuando todo entró.
4. Tests: el formulario exige archivo y bodega antes de enviar y llama la action con el `FormData`
   correcto; el reporte muestra el resumen, la tabla de rechazos y el recorte; la página monta el enlace
   de la plantilla con el `href` correcto y no rompe sin resultados.
5. Verificar (§0.3), commit `fase20-task 5: pagina de importacion con plantilla y reporte`, **pedir aprobación**.

---

## 4. Seguridad

Todo pasa por `getTenantDb(session.user.tenantSchema)` con guard antes de cualquier lectura/escritura:
**ADMIN o RECEPCION** (servicios, solo ADMIN — D9). La bodega se valida con `scopeBodega` y el proveedor
contra la sede activa: un archivo no puede escribir en otra sede. El cliente nunca decide qué se crea:
la action relee el archivo, valida cada fila con los esquemas del servidor y calcula claves y montos
(con `roundMoney`) en el servidor. Los topes (5 MB, 2.000 filas/hoja, 200 rechazos visibles) evitan que
un archivo enorme consuma memoria o tiempo. Ninguna consulta devuelve filas completas de `Usuario`
(siempre `select` mínimo). El nombre del archivo subido **no** se usa como ruta ni se guarda en disco:
se lee en memoria y se descarta. La plantilla se descarga autenticada (`requireRole`).

## 4-bis. Decisiones del fix round (revisión final)

La revisión final del diff completo encontró un crítico (un vehículo podía quedar asignado a un cliente
homónimo), cuatro importantes y varios menores; se cerraron antes del merge. Quedan como parte del
diseño, no como parches:

- **D13 — El cliente de un vehículo se identifica sin ambigüedad.** Si la fila de Vehículos trae
  documento, **manda el documento**: no se cae al nombre si no resuelve (caer al nombre era lo que
  asignaba el vehículo a un homónimo). Sin documento se busca por nombre, y si ese nombre lo comparten
  dos clientes la fila se rechaza pidiendo el documento. En Clientes, una fila **con** documento se
  identifica solo por documento: antes se miraban documento y nombre, así que un cliente nuevo que se
  llamara como otro existente se omitía como "ya existía" (pérdida silenciosa de datos).
- **D14 — Las transacciones tienen margen y no dejan ids fantasma.** Las cuatro transacciones (una por
  hoja, D11) piden `maxWait: 10s` y `timeout: 120s`: Prisma aborta a los 5 s por defecto y el tope de la
  fase admite 2.000 filas con hasta tres sentencias cada una. Además los clientes creados se registran
  **después** del commit, así que un rollback no deja a Vehículos resolviendo contra ids que no existen
  (que tumbaba su hoja entera en vez de rechazar por fila).
- **D15 — El dinero se acota antes de escribir.** Las columnas de dinero son `Decimal(10,2)`: un precio
  por encima del máximo se rechaza con mensaje propio en español (como ya hacía Servicios con
  `PRECIO_MAXIMO`) en vez de reventar el `create` y dejar la hoja entera en un error genérico.
- **D16 — El reporte prioriza lo accionable.** El tope de 200 novedades muestra primero las
  **rechazadas** y después las que ya existían (si no, reimportar un archivo llenaba las 200 con "ya
  existía" y ocultaba lo que hay que corregir), y el exceso de filas por encima del tope se agrupa en
  **un solo aviso** (`filasSobrantes` mantiene el conteo real en el resumen).
- **D17 — Una sola entrada de mercancía por hoja.** Las filas de Repuestos con cantidad inicial
  comparten una `EntradaMercancia` (un ítem por repuesto) en vez de crear una entrada por fila: refleja
  mejor una carga inicial de inventario y sigue siendo trazable, con test propio.
- **D18 — Las claves de duplicado viven en `duplicados.ts`.** `claveDuplicado` salió del contrato de
  hojas (nadie lo leía y no podía expresar la regla doble de Clientes); la acción reutiliza `buscarHoja`
  en vez de su propio emparejador, se eliminó `contarNovedades` sin uso y el booleano de Servicios usa
  `normalizarBooleano` en vez de reimplementarlo.
- **Menores del mismo round:** el correo se guarda en minúsculas, la hoja de instrucciones avisa de que
  la segunda fila es un ejemplo (subir la plantilla sin tocarla importaba la fila de ejemplo como dato),
  y se reforzaron los tests (homónimos, placa ya existente con otro formato, fallo de Repuestos,
  opciones de transacción, topes).

## 5. Verificación final de la fase

`npx tsc --noEmit` (`--incremental false` si hay sandbox), `npm test` completo, `npx eslint` en lo tocado
y `npm run build`. Revisar el diff completo de la rama contra este documento (revisión final con otro
modelo) y hacer el fix round de los hallazgos. Reporte.

## 6. Cierre (solo con aprobación del usuario)

1. **No hay migración que aplicar** (D8): verificar solo que `npx prisma migrate status` sigue sin
   pendientes en `taller_dev` y `taller_dev_reference`.
2. Dejar `npm run dev` corriendo para la prueba manual del usuario (idealmente en un worktree aparte del
   checkout de producción, como en la fase 19) y probar la importación de un archivo real de ejemplo.
3. Con el visto bueno: `git checkout main && git pull && git merge --no-ff fase20-importar-excel` y push;
   actualizar `PROJECT_BRIEF.md` (estado, roadmap y la nota del ledger) en el mismo cierre.
4. **El deploy lo hace el usuario** (pull + `npm install` + `npx prisma generate` + build + reinicio).
   Esta fase **sí cambia dependencias**: el `npm install` en el servidor es obligatorio.
