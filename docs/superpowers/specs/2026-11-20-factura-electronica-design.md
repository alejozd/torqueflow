# Facturación electrónica DIAN — diseño

Fecha: 2026-11-20 · Rama: `fase-fe-factura-electronica`

## 1. Objetivo y contexto

TorqueFlow genera facturas internas (`Factura`, una por orden) pero no las reporta a la DIAN.
Esta fase agrega la facturación electrónica mediante un **núcleo reutilizable** que no sabe
nada de talleres, para usarlo después en otros programas propios (veterinaria, ferretería…),
y un **lado TorqueFlow** que lo conecta con la base, la configuración del taller y las pantallas.

- Proveedor elegido: **Nextpyme Plus** (API REST, modalidad software propio; plan
  desarrolladores con bolsa de documentos repartible entre empresas). Docs:
  https://developers.nextpyme.plus. Ejemplo de endpoint: `POST https://api.nextpyme.plus/api/ubl2.1/invoice`,
  autenticación Bearer token.
- Todavía **no hay token** de Nextpyme: las tareas 1–7 se construyen y prueban con un
  proveedor simulado; la conexión real es la tarea 8.
- Helisa queda **fuera** de este diseño.

## 2. Alcance

**Incluido (v1):**
- Factura electrónica de venta generada desde la `Factura` de una orden.
- Nota crédito **total** (anulación) de una factura aceptada.
- Activación por taller; envío automático o manual configurable por taller.
- Cuenta de Nextpyme: bolsa del dueño de TorqueFlow **o** cuenta propia del taller.
- Ambientes `SIMULADO`, `PRUEBAS`, `PRODUCCION`.

**Fuera de la v1:** POS electrónico del Mostrador, documento soporte, nómina, RADIAN,
notas crédito parciales, notas débito, reintento automático programado (no hay cron en el
servidor), asistente de alta del taller dentro de TorqueFlow, consulta de la bolsa total de
Nextpyme, Helisa.

**Alta de un taller:** se hace fuera, en el portal/soporte de Nextpyme (empresa, certificado,
resolución, set de pruebas). TorqueFlow solo guarda token, emisor, resolución y ambiente.

## 3. Arquitectura

### 3.1 Núcleo reutilizable — `src/modulos/factura-electronica/`

Sin dependencias de TorqueFlow: ni Prisma, ni Next, ni `src/lib`, ni `src/app`. Solo
TypeScript y `fetch`. Una regla de ESLint (`no-restricted-imports`) lo hace cumplir.
Exporta todo desde `index.ts`.

| Parte | Responsabilidad |
|---|---|
| `modelo` | Tipos del documento: `Emisor`, `Adquirente`, `Linea`, `Impuesto`, `Totales`, `DocumentoElectronico` (discriminado `FACTURA` / `NOTA_CREDITO`), `Resolucion`. Usa **códigos DIAN** (tipo de documento de identidad, municipio DANE, unidad de medida, tributo, forma/medio de pago, concepto de corrección de nota crédito). Montos en **centavos enteros** (`number` entero). |
| `calculo` | A partir de las líneas calcula base gravable por tarifa, impuestos, descuentos y totales monetarios (línea, base, impuestos incluidos, a pagar). La base gravable solo suma líneas con impuesto. Redondeo a centavos explícito y probado. |
| `validacion` | Revisa antes de enviar: campos obligatorios, DV del NIT (algoritmo DIAN), número dentro del rango y fecha dentro de la vigencia de la resolución, totales consistentes, nota crédito con referencia (número + CUFE + fecha) a la factura. Devuelve `ErrorValidacion[]` con mensaje en español sencillo y el campo afectado. |
| `proveedores` | Interfaz `ProveedorFacturaElectronica` (ver 3.2) con dos implementaciones: `simulado` y `nextpyme`. Los códigos DIAN se traducen a los IDs propios del proveedor **dentro** de su adaptador. |
| `mensajes-dian` | Catálogo que traduce reglas de rechazo/advertencia DIAN (p. ej. `FAJ43b`, `Regla 90`) a "qué pasó" y "cómo corregirlo". Código desconocido → se muestra el texto original de la DIAN. |

### 3.2 Contrato del proveedor

```ts
interface ReferenciaDocumento { tipo: "FACTURA" | "NOTA_CREDITO"; prefijo: string; numero: number; cufe?: string }

interface ProveedorFacturaElectronica {
  enviar(doc: DocumentoElectronico): Promise<ResultadoEnvio>;
  consultarEstado(ref: ReferenciaDocumento): Promise<ResultadoEnvio | { estado: "NO_ENCONTRADO" }>;
  descargar(ref: ReferenciaDocumento, formato: "PDF" | "XML"): Promise<Uint8Array>;
  probarConexion(): Promise<{ ok: true } | { ok: false; mensaje: string }>;
}

type ResultadoEnvio =
  | { estado: "ACEPTADO"; cufe: string; fechaValidacion: string; advertencias: MensajeDian[] }
  | { estado: "RECHAZADO"; motivos: MensajeDian[] }                 // DIAN o validación del proveedor (422)
  | { estado: "ERROR_TEMPORAL"; mensaje: string }                   // caída, tiempo agotado, 5xx
  | { estado: "ERROR_CONFIGURACION"; mensaje: string };             // token inválido (401/403)
```

Ajustes tras leer la documentación real de Nextpyme: los archivos se descargan por
prefijo+número (`/download/{nit}/FES-{prefijo}{numero}.pdf`), no por CUFE, así que el XML/PDF
no viajan en `ACEPTADO` sino que se piden con `descargar`. Nextpyme solo consulta estado por
CUFE: sin CUFE, `consultarEstado` responde `NO_ENCONTRADO` y el reenvío con el mismo número
devuelve la Regla 90 ("documento procesado anteriormente"), que el servicio interpreta como
"ya estaba en la DIAN". `ERROR_CONFIGURACION` no deja el documento en `POR_CONFIRMAR` (seguro
no llegó a la DIAN) sino en `PENDIENTE` con aviso de revisar el token.

Fábrica: `crearProveedor({ ambiente, token })` → `SIMULADO` devuelve el simulado; `PRUEBAS`
y `PRODUCCION` devuelven el de Nextpyme con su URL/ambiente.

El **simulado** acepta por defecto, genera un CUFE falso determinista y un PDF/XML mínimos;
se puede forzar a `RECHAZADO` o `ERROR_TEMPORAL` para probar cada camino: en código por una
opción de construcción, y en la app por el campo `resultadoSimulado`
(`ACEPTAR | RECHAZAR | CAIDA`) de la configuración, visible solo con ambiente `SIMULADO`.

### 3.3 Lado TorqueFlow — `src/lib/factura-electronica/`

- `mapear.ts`: `Factura` + ítems + `Cliente` + configuración → `DocumentoElectronico` del núcleo
  (usa el `desgloseIva` congelado al emitir).
- `servicio.ts`: emitir / enviar / reintentar / consultar / anular; transacciones y consecutivo.
- `almacenamiento.ts`: guarda XML y PDF con `src/lib/storage`.
- `configuracion.ts`: lectura de la configuración, descifrado del token con `src/lib/crypto/secret-box`.
- Server actions en `src/app/actions/factura-electronica-actions.ts`.

## 4. Datos (base de cada taller; requiere migración con permiso del usuario)

### 4.1 `ConfiguracionFacturaElectronica` (singleton, patrón de `ConfiguracionSmtp`)
- `activa` Boolean (false), `envio` enum `AUTOMATICO | MANUAL` (AUTOMATICO),
  `ambiente` enum `SIMULADO | PRUEBAS | PRODUCCION` (SIMULADO).
- `cuenta` enum `BOLSA | PROPIA`; `tokenCifrado` String? (secret-box). En `BOLSA` el token lo
  registra el super-admin; en `PROPIA` el admin del taller.
- Emisor: `nit`, `dv`, `razonSocial`, `regimen`/responsabilidades fiscales, `municipio`, `direccion`.
- Resolución: `resolucionNumero`, `prefijo`, `rangoDesde`, `rangoHasta`, `vigenciaDesde`,
  `vigenciaHasta` (`@db.Date`, medianoche UTC — ver trampa en TRASPASO), `siguienteConsecutivo`.
- Prefijo/consecutivo de notas crédito (`prefijoNotaCredito`, `siguienteConsecutivoNotaCredito`).
- `resultadoSimulado` enum `ACEPTAR | RECHAZAR | CAIDA` (ACEPTAR), solo se usa en `SIMULADO`.
- `ultimaPruebaAt`, `ultimaPruebaExitosa`, `ultimaPruebaMensaje`.

### 4.2 `Cliente` — campos opcionales nuevos
`tipoDocumento` (enum DIAN), `dv`, `tipoPersona` (`NATURAL | JURIDICA`), `responsabilidadFiscal`,
`municipioCodigo` (DANE), `direccion`. El campo `documento` existente no cambia.
Si faltan datos al facturar, se ofrece completarlos o facturar como **consumidor final**
(`222222222222`), válido solo para persona natural.

### 4.3 `DocumentoElectronico` (tabla nueva)
- `tipo` (`FACTURA | NOTA_CREDITO`), `facturaId`, `documentoReferenciaId` (nota → factura).
- `prefijo`, `numero` (consecutivo de resolución; `@@unique([tipo, prefijo, numero])`).
- `estado`: `PENDIENTE | ENVIANDO | POR_CONFIRMAR | ACEPTADO | RECHAZADO` (+ `ANULADO` para la
  factura con nota crédito aceptada).
- `cufe`, `fechaValidacion`, `mensajes` Json (ya traducidos), `intentos`, `ultimoIntentoAt`.
- `xmlRuta`, `pdfRuta` (storage propio; Nextpyme guarda solo 1 año, nosotros siempre).
- `payload` Json: foto del `DocumentoElectronico` enviado (auditoría y reintento sin recalcular).
- `ambiente` con que se envió, `creadoPorId`.

`Factura` no cambia de columnas; los talleres sin facturación electrónica no se ven afectados.

## 5. Flujos

### 5.1 Emitir y enviar
1. Se crea la `Factura` como hoy (transacción actual intacta).
2. Si la configuración está `activa`: se mapea y **valida**. Si la validación falla → no se
   asigna consecutivo, no se llama al proveedor; se muestran los faltantes.
3. En una transacción se asigna `siguienteConsecutivo` (incremento atómico) y se crea el
   `DocumentoElectronico` en `ENVIANDO` con su `payload`.
4. Si `envio = AUTOMATICO` se envía en la misma acción (tiempo máximo ~20 s); si `MANUAL`, los
   pasos 2–4 empiezan con el botón "Enviar a la DIAN".
5. Resultado: `ACEPTADO` → guarda CUFE/fecha/mensajes, descarga y almacena XML+PDF;
   `RECHAZADO` → guarda motivos traducidos; `ERROR_TEMPORAL` o tiempo agotado → `POR_CONFIRMAR`.

### 5.2 Reintentar
- Siempre con el **mismo prefijo+número y el mismo `payload`** salvo que se haya corregido un
  dato (entonces se vuelve a mapear y validar conservando el número).
- Desde `POR_CONFIRMAR` primero se llama `consultarEstado`: si la DIAN ya lo tiene se adopta ese
  resultado; si `NO_ENCONTRADO` se reenvía.
- Un rechazo no consume el número ante la DIAN: se corrige y se reenvía con el mismo.
- Reintento solo por botón; aviso en Inicio de documentos `PENDIENTE/POR_CONFIRMAR/RECHAZADO`.

### 5.3 Nota crédito total
- Solo sobre factura `ACEPTADO`. Se elige el concepto de corrección DIAN, se referencia CUFE,
  número y fecha de la factura, y se usa la numeración de notas crédito.
- Al aceptarse: la factura electrónica pasa a `ANULADO`, `Factura.saldoPendiente = 0`.
  Si la factura tenía pagos, se avisa que deben devolverse o dejarse como anticipo (no se
  automatiza en v1).
- Una factura con documento `ACEPTADO` no se puede editar; las correcciones van por nota crédito.

## 6. Pantallas

- **Configuración del taller → pestaña "Facturación electrónica"** (junto a Correo y avisos /
  Tarifas de IVA): activar, envío automático/manual, ambiente (pasar a producción con
  `ConfirmacionEnLinea`), emisor, resolución (aviso de rango o vigencia por agotarse), cuenta
  (bolsa / token propio), **Probar conexión** con último resultado.
- **Ficha de la factura:** tarjeta "Factura electrónica" con estado en lenguaje sencillo; si
  aceptada: CUFE, fecha, *Descargar PDF*, *Descargar XML*, *Reenviar al cliente*; si rechazada o
  por confirmar: qué pasó, qué corregir, *Reenviar*; *Anular con nota crédito* (motivo +
  `ConfirmacionEnLinea`). El PDF propio de TorqueFlow se mantiene.
- **Lista de facturas:** insignia de estado DIAN por fila y filtro "Sin enviar o rechazadas".
- **Ficha del cliente:** sección plegable "Datos para factura electrónica" (municipio con
  buscador). Al generar factura con datos faltantes: completar ahí mismo o consumidor final.
- **Inicio:** aviso "N facturas sin enviar a la DIAN" (solo si N > 0) que abre la lista filtrada.
- **Super-admin:** por taller con `BOLSA`, registrar su token y ver documentos aceptados en el
  periodo (para cobrarlos).
- **Permisos (esquema Fase 26):** enviar/reenviar usa el permiso de facturar existente; nuevos
  "Anular con nota crédito" y "Configurar facturación electrónica", ambos con requisito del de facturar.

## 7. Errores — resumen

| Situación | Qué pasa |
|---|---|
| Datos incompletos / totales inconsistentes | Validación local, sin consecutivo ni llamada; lista de faltantes con enlace a corregir |
| Rechazo DIAN | `RECHAZADO`, motivos traducidos, corregir y reenviar con el mismo número |
| Caída / tiempo agotado / 5xx | `POR_CONFIRMAR`; reintento consulta estado antes de reenviar |
| Token inválido (401) | Error claro "La conexión con el proveedor no es válida", enlace a Configuración |
| Resolución vencida o rango agotado | Validación local bloquea y avisa al admin |
| Falla guardando XML/PDF tras aceptación | Documento queda `ACEPTADO`; se puede volver a descargar con `descargar(cufe)` |

## 8. Pruebas

- **Núcleo (Vitest `unit`, sin base):** cálculo con IVA 19 %, 5 % y exento mezclados, descuentos,
  redondeos; DV de NIT; rango y vigencia; validación de nota crédito; traducción de mensajes.
- **Adaptador Nextpyme:** respuestas grabadas tomadas de su documentación pública; verifica
  JSON generado y lectura de respuestas (aceptada, rechazada, advertencias, 401, 5xx).
  La prueba contra su sandbox real es manual y no corre en CI.
- **Lado TorqueFlow (`test:db`):** consecutivo sin huecos con envíos concurrentes; reintento con
  el mismo número; `POR_CONFIRMAR` consulta antes de reenviar; nota crédito deja saldo en 0.
- **Componentes:** estados de la tarjeta de la factura y la pestaña de configuración.
- **Frontera:** ESLint falla si el núcleo importa fuera de su carpeta.

## 9. Orden de entrega (un commit por tarea, `fase-fe-task N: ...`)

1. Núcleo: modelo, cálculo, validación.
2. Proveedor simulado + mensajes DIAN.
3. Adaptador Nextpyme con respuestas grabadas.
4. Migración: configuración, campos de cliente, `DocumentoElectronico` (**pedir permiso**).
5. Servicio TorqueFlow: emitir, enviar, reintentar, consultar, almacenamiento.
6. Pantallas: configuración, ficha de factura, lista, cliente, Inicio, super-admin.
7. Nota crédito total + permisos nuevos.
8. (Cuando haya token) conexión al sandbox de Nextpyme y set de pruebas.

Las tareas 1–7 no necesitan cuenta de Nextpyme.

## 10. Riesgos y preguntas abiertas

- El plan "Estudiantes" de Nextpyme: confirmar si sus 1.000 documentos sirven en producción.
- Nextpyme es una empresa pequeña: el contrato de proveedor permite cambiarlo sin tocar TorqueFlow.
- Los IDs de catálogos de Nextpyme (municipios, tributos, unidades) se confirman en su
  documentación durante la tarea 3; el núcleo solo maneja códigos DIAN.
- Responsabilidad legal de numeración: la resolución la tramita cada taller; TorqueFlow solo
  respeta rango y vigencia.
