# Rediseño de la ficha del usuario y sus permisos: plan

> **Para el agente que lo ejecute:** lee `AGENTS.md`, `RULES.md` y `docs/TRASPASO-AGENTES.md` (§3 proceso, §7 trampas, y la sección "Fase 26") antes de tocar código. Rama `usuario-permisos-rediseno` desde `main`. Commits `rediseno-permisos-task N: …` con push tras cada tarea; al final, revisión independiente del diff, merge `--no-ff` a `main` **solo con aprobación del usuario**. Al terminar cada tarea: decir "vamos en X de 5" y preguntar antes de seguir.

**Objetivo:** llevar `/usuarios/[id]` al diseño que propuso Stitch (`docs/Evidencias/Permisos-Usuario/screen.png`, archivo del usuario: no moverlo ni commitearlo): una sola pantalla de "Editar usuario y permisos" con cabecera del usuario, datos en 3 columnas y los permisos en tarjetas por grupo con buscador, contadores y barra de cambios sin guardar.

> **Estado (2026-10-17):** rama `usuario-permisos-rediseno` creada desde `main`. **Tareas 1 a 4 hechas** (ver notas en cada tarea). **Tareas 1 a 5 hechas y mergeadas a `main`.** Pendiente: desplegar y los menores de abajo. Vamos en 5 de 5.

**Sin migraciones.** Todo sale de datos que ya existen (`Usuario.createdAt`, `activo`, `role`, `sedeIds`, `permisosAgregados`, `permisosQuitados`).

## Lo que ya existe (no reescribir)

- Página: `src/app/(dashboard)/usuarios/[id]/page.tsx` (exige `usuarios.gestionar`; ADMIN ve el texto "El administrador tiene todos los permisos" en vez de la sección).
- Formulario de datos: `usuarios/[id]/editar-usuario-form.tsx` → `updateUsuarioAction` (al **cambiar el rol vacía las excepciones**; revalida `/usuarios` y `/usuarios/[id]`).
- Permisos: `usuarios/[id]/permisos-usuario.tsx` (+ test) → `guardarPermisosUsuarioAction(usuarioId, marcados)`, que guarda solo la diferencia con el rol (`excepcionesDesdeMarcados`) y deja `AuditLog`. El editor se remonta con `key` cuando cambian rol o listas (no romper esto: lo pidió la revisión final, hallazgo I5).
- Catálogo: `src/lib/auth/permisos.ts` → `PERMISOS`, `GRUPOS_PERMISO`, `etiqueta`, `PERMISOS_SOLO_ADMIN` (★, nunca se muestran ni se envían), `permisosEfectivos`.
- Suspender/activar: buscar la acción existente de `activo` en `usuario-actions.ts` antes de crear nada.

## Decisiones (ya tomadas, no re-discutir)

- **D1. Dos guardados siguen siendo dos acciones.** El botón superior "Guardar cambios" y la barra inferior guardan **solo lo que cambió**: si cambió el formulario de datos, `updateUsuarioAction`; si cambiaron los permisos, `guardarPermisosUsuarioAction`. **Si cambió el rol, se guarda el rol y se descartan los permisos marcados** (el rol vacía las excepciones; avisar con un texto: "Al cambiar el rol, los permisos vuelven a los del rol nuevo"). Nunca se fusionan en una acción nueva.
- **D2. Textos en español sencillo de Colombia, sin jerga.** Nada de "RBAC", "Matriz granular", "Login", "Restablecer a Rol Base". Títulos: "Editar usuario y permisos"; sección "Permisos"; botón "Volver al rol base" (con `ConfirmacionEnLinea`, como hoy); aviso del rol: "Permisos del rol Técnico: 12 · 2 cambios".
- **D3. Lo que NO se copia del mockup:** "Miembro desde" solo si `createdAt` ya llega a la página (si no, se agrega al `select`, sin migración); "Sede Norte Express (Inactiva)" se muestra solo si el modelo de sede tiene estado; el texto partido en dos líneas de la imagen es un defecto de Stitch, no diseño.
- **D4. "Marcar todos" / "Desmarcar todos" actúan sobre los permisos visibles** (los que deja el buscador), nunca sobre ★. **"Solo lectura"** = deja marcados solo los permisos de ver (`*.ver` y `*.verTodas`) y desmarca el resto de los visibles. Los tres pasan por el estado local; nada se guarda hasta "Guardar cambios".
- **D5. Preferencias de UI del usuario** (obligatorias): todo chip/badge con punto de color antes del texto; color en punto/franja/ícono, no fondos completos de tarjeta; tonos de `KPI_TONE`; secciones con `TituloSeccion`; superficies: fondo gris cálido, tarjetas blancas con sombra; lo clicable con `cursor-pointer` y hover; el check verde sin círculo. Revisar en Chrome a ~1366 px midiendo con JS. El naranja de la marca existente se usa para el botón principal, igual que el resto de la app.

## Tareas

### Task 1: Cabecera del usuario
`page.tsx`: tarjeta superior con iniciales en cuadro de color, nombre, chip "Activo"/"Suspendido" (con punto), correo y "Miembro desde <mes año>" (D3), y a la derecha el interruptor "Estado de cuenta" conectado a la acción existente de activar/suspender. Arriba de todo: título "Editar usuario y permisos", subtítulo corto, y los botones "Volver al rol base" y "Guardar cambios" (este último se cablea en la tarea 4). ADMIN: sin "Volver al rol base".
Test: renderiza nombre, correo, chip con el estado correcto; el interruptor llama a la acción.

**Hecho (tarea 1):** `usuarios/[id]/cabecera-usuario.tsx` (+ test) con iniciales, nombre, chip Activo/Suspendido, correo y "Miembro desde"; `createdAt` agregado a `listUsuariosConSedes` (sin migración); título "Editar usuario y permisos" con subtítulo. **Movido a otras tareas (decisión):** el interruptor "Estado de cuenta" pasa a la **tarea 2**, porque no existe una acción aparte para activar/suspender: `activo` es un campo de `updateUsuarioAction`, así que el interruptor debe ser ese campo del formulario. Los botones superiores "Volver al rol base" y "Guardar cambios" pasan a la **tarea 4**, donde se cablean (no se dejan botones sin función).

### Task 2: Datos en tres columnas
Reacomodar `editar-usuario-form.tsx` (sin cambiar su acción ni validación) en tres bloques con título de punto de color: "Datos personales" (nombre, correo), "Seguridad y rol" (contraseña con "Déjala en blanco para conservar la actual", rol), "Sedes" (sedes con acceso, sede predeterminada). El formulario deja de tener botón propio: expone su estado "con cambios" y su envío al contenedor (tarea 4).
Test: los tests actuales de `editar-usuario-form.test.tsx` siguen pasando (ajustar solo selectores del botón).

**Hecho (tarea 2):** `editar-usuario-form.tsx` en tres bloques `FormGroup` ("Datos personales", "Seguridad y rol", "Sedes") con **container query** (`@container` + `@4xl:grid-cols-3`): tres columnas en la ficha y apilado en el diálogo "Editar" de la lista, que usa el mismo formulario. El select "Estado" pasó a un interruptor "Estado de cuenta" (`role="switch"`, mismo campo `activo` de `updateUsuarioAction`). La tarjeta de la página se llama "Datos del usuario". **Decisión:** el formulario **conserva su botón "Guardar cambios"** hasta la tarea 4; quitarlo antes dejaría la ficha sin forma de guardar. La tarea 4 lo quita (solo en la ficha; el diálogo lo sigue necesitando) y conecta el envío al contenedor.

### Task 3: Permisos en tarjetas
`permisos-usuario.tsx`: grilla de 3 columnas (2 en pantallas medianas, 1 en móvil), una tarjeta por `GRUPOS_PERMISO` con ícono, título y contador "N / M activos"; dentro, las casillas con su etiqueta y los chips "Agregado"/"Quitado" de hoy. Encima: aviso del rol (D2), buscador "Buscar permiso (orden, cotización, caja…)" que filtra por etiqueta sin tildes ni mayúsculas, y los botones "Solo lectura", "Marcar todos", "Desmarcar todos" (D4). Un grupo sin coincidencias se oculta.
Tests: el contador cambia al marcar; el buscador "caja" deja solo el grupo de caja; "Marcar todos" con filtro marca solo lo visible y nunca un ★; "Solo lectura" deja solo los `.ver`. Mantener los 5 tests actuales.

**Hecho (tarea 3):** `permisos-usuario.tsx` con aviso "Permisos del rol X: N · M cambios", buscador (`type="search"`, sin tildes ni mayúsculas con `\p{Diacritic}`), botones "Solo lectura" / "Marcar todos" / "Desmarcar todos" que actúan solo sobre lo visible (`aplicarAVisibles`; los ★ nunca están en `VISIBLES`), y una tarjeta por grupo (ícono con tono de `KPI_TONE`, contador "N / M activos" sobre el total del grupo, `fieldset` con `legend` oculto para lectores). Grilla 1/2/3 columnas. Se mantienen el `key` de I5 y los botones "Guardar permisos" / "Volver al rol base" al pie (la tarea 4 los sube y los une con el guardado del formulario). 13 tests en el archivo.

### Task 4: Guardado único y barra de cambios sin guardar
Contenedor cliente en `page.tsx` que junta ambos estados: barra fija abajo "Tienes cambios sin guardar" con "Descartar" y "Guardar cambios" (visible solo con cambios), y el botón superior hace lo mismo. Reglas de D1. Toast con el resultado de cada acción; si una falla, no se limpia su estado. "Descartar" vuelve a los datos del servidor.
Tests: cambiar solo un permiso → solo se llama `guardarPermisosUsuarioAction`; cambiar el rol y un permiso → solo `updateUsuarioAction` y aparece el aviso de D1; error → la barra sigue visible.

**Hecho (tarea 4):** `usuarios/[id]/ficha-usuario.tsx` (cliente) junta título, cabecera, formulario y permisos; `page.tsx` solo carga datos y la renderiza. "Guardar cambios" arriba y en la barra fija "Tienes cambios sin guardar" (con "Descartar") corren lo que diga `decidirGuardado` (D1, función pura con test): formulario si tiene cambios; permisos si tienen cambios **y no cambió el rol** (aviso "Al cambiar el rol, los permisos vuelven a los del rol nuevo"). El formulario y el editor de permisos ganaron props opcionales de modo ficha (`controlRef` + `onEstado` / `onCambios`) que ocultan sus botones propios; el diálogo "Editar" de la lista no las usa y queda igual. Descartar remonta ambos con una clave de versión; tras guardar, la clave del formulario (con sus datos) lo remonta limpio. **Decisión:** "Volver al rol base" se queda dentro de la sección Permisos con su `ConfirmacionEnLinea` (ya probada) en vez de subir a la cabecera. 8 tests en `ficha-usuario.test.tsx`. **Pendiente para la tarea 5:** correr la suite completa y `npm run build` (en las tareas 1–4 solo se corrieron los tests de usuarios, `tsc` y eslint), y mirarlo en el navegador.

### Task 5: Revisión visual y cierre

**Avance de la tarea 5 (se actualiza paso a paso):**
- [x] Suite completa + `npm run build`: 337 archivos / 2801 tests, build OK (2026-10-17)
- [x] Revisión en el navegador: el usuario la revisó y la aprobó ("todo ok", 2026-10-17)
- [x] Revisión independiente (otro modelo): 0 Critical, 3 Important arreglados con test antes del merge — la barra no se iba al cambiar solo la contraseña; faltaba el toast del formulario; doble envío y medio guardado (ahora los permisos esperan a que el formulario salga bien). 337 archivos / 2804 tests, build OK.
- [x] Merge `--no-ff` a `main` aprobado por el usuario (2026-10-17). Falta: despliegue en el servidor (`sudo git pull` + `sudo ./deploy.sh`, sin migraciones)

Lanzar `npm run dev` en segundo plano (puerto 3025; la base es la real: no guardar cambios de prueba sobre usuarios reales, usar uno de prueba), revisar a 1366 px y en móvil, y pedirle al usuario que lo mire. Verificación: `npx tsc --noEmit --incremental false`, `npm test`, `npx eslint` de lo tocado, `npm run build`. Revisión independiente del diff (otro modelo, solo lectura) y una ronda de arreglos. Merge solo con aprobación.

## Riesgos conocidos

- Romper el `key` del editor (I5): después de cambiar el rol, los permisos tienen que mostrar los del rol nuevo. Hay test; no borrarlo.
- Tests de interfaz sensibles a la carga (`nuevo-vehiculo-form`, `agregar-item-form`): si fallan en la suite completa, correrlos solos antes de concluir nada.
- `eslint` prohíbe `setState` dentro de `useEffect` (ver §7 del traspaso): para "Descartar", remontar con `key` o ajustar estado en render.

## Pendientes de esta feature (menores de la revisión, no bloquean)

- El contador "N / M activos" se posiciona con `-mt-9 self-end` sobre el encabezado de la tarjeta: frágil si el título del grupo se parte en dos líneas ("Clientes y vehículos" en pantallas angostas). Mejor ponerlo dentro de la fila del encabezado.
- Accesibilidad: la barra de cambios no tiene `aria-live`; el interruptor de estado no tiene anillo de foco visible (`focus-visible:ring`).
- Si se cambia el rol en el formulario sin tocar permisos, la barra no avisa que los permisos mostrados son los del rol anterior hasta guardar (el aviso de D1 solo sale si cambiaron los dos).
- `sticky bottom-0 -mx-4` de la barra depende del padding del layout: revisar en móvil.
- `permisosConCambios` no se reinicia si el editor se desmonta (usuario pasado a ADMIN); hoy no afecta porque se filtra con `!esAdmin`.

## Revisión de cierre (2026-10-22)

Revisión completa del rediseño (`c21ff49..549acb2`, otro modelo, solo lectura): **OK tal como está**, 0 Critical, 0 Important, 7 Minor. Los 3 hallazgos de la revisión anterior quedaron arreglados en `35ef6f4` sin bugs nuevos; I5 se mantiene; los ★ no se pueden marcar ni enviar; el diálogo "Editar" de la lista no cambió. Menores nuevos que vale la pena arreglar (informe en `.superpowers/sdd/2026-10-17-permisos-usuario-rediseno/final-review-report.md`, fuera de git):

- "Descartar" sigue activo mientras el formulario guarda: si se pulsa en ese momento, el guardado se hace pero no sale el toast.
- "Solo lectura" marca **todos** los permisos de ver (incluidos `ordenes.verTodas` y `auditoria.ver`), no solo deja los de ver que ya estaban marcados: **el usuario debe confirmar cuál de los dos significados quiere**.
- El test del toast del formulario pasa por una llamada de un test anterior (el mock de `toast` no se limpia) y el toast de error no tiene test.
- El interruptor de estado no tiene anillo de foco visible (ya estaba en los pendientes; se recomienda arreglarlo).
