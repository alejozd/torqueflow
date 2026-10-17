# Rediseño de la ficha del usuario y sus permisos: plan

> **Para el agente que lo ejecute:** lee `AGENTS.md`, `RULES.md` y `docs/TRASPASO-AGENTES.md` (§3 proceso, §7 trampas, y la sección "Fase 26") antes de tocar código. Rama `usuario-permisos-rediseno` desde `main`. Commits `rediseno-permisos-task N: …` con push tras cada tarea; al final, revisión independiente del diff, merge `--no-ff` a `main` **solo con aprobación del usuario**. Al terminar cada tarea: decir "vamos en X de 5" y preguntar antes de seguir.

**Objetivo:** llevar `/usuarios/[id]` al diseño que propuso Stitch (`docs/Evidencias/Permisos-Usuario/screen.png`, archivo del usuario: no moverlo ni commitearlo): una sola pantalla de "Editar usuario y permisos" con cabecera del usuario, datos en 3 columnas y los permisos en tarjetas por grupo con buscador, contadores y barra de cambios sin guardar.

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

### Task 2: Datos en tres columnas
Reacomodar `editar-usuario-form.tsx` (sin cambiar su acción ni validación) en tres bloques con título de punto de color: "Datos personales" (nombre, correo), "Seguridad y rol" (contraseña con "Déjala en blanco para conservar la actual", rol), "Sedes" (sedes con acceso, sede predeterminada). El formulario deja de tener botón propio: expone su estado "con cambios" y su envío al contenedor (tarea 4).
Test: los tests actuales de `editar-usuario-form.test.tsx` siguen pasando (ajustar solo selectores del botón).

### Task 3: Permisos en tarjetas
`permisos-usuario.tsx`: grilla de 3 columnas (2 en pantallas medianas, 1 en móvil), una tarjeta por `GRUPOS_PERMISO` con ícono, título y contador "N / M activos"; dentro, las casillas con su etiqueta y los chips "Agregado"/"Quitado" de hoy. Encima: aviso del rol (D2), buscador "Buscar permiso (orden, cotización, caja…)" que filtra por etiqueta sin tildes ni mayúsculas, y los botones "Solo lectura", "Marcar todos", "Desmarcar todos" (D4). Un grupo sin coincidencias se oculta.
Tests: el contador cambia al marcar; el buscador "caja" deja solo el grupo de caja; "Marcar todos" con filtro marca solo lo visible y nunca un ★; "Solo lectura" deja solo los `.ver`. Mantener los 5 tests actuales.

### Task 4: Guardado único y barra de cambios sin guardar
Contenedor cliente en `page.tsx` que junta ambos estados: barra fija abajo "Tienes cambios sin guardar" con "Descartar" y "Guardar cambios" (visible solo con cambios), y el botón superior hace lo mismo. Reglas de D1. Toast con el resultado de cada acción; si una falla, no se limpia su estado. "Descartar" vuelve a los datos del servidor.
Tests: cambiar solo un permiso → solo se llama `guardarPermisosUsuarioAction`; cambiar el rol y un permiso → solo `updateUsuarioAction` y aparece el aviso de D1; error → la barra sigue visible.

### Task 5: Revisión visual y cierre
Lanzar `npm run dev` en segundo plano (puerto 3025; la base es la real: no guardar cambios de prueba sobre usuarios reales, usar uno de prueba), revisar a 1366 px y en móvil, y pedirle al usuario que lo mire. Verificación: `npx tsc --noEmit --incremental false`, `npm test`, `npx eslint` de lo tocado, `npm run build`. Revisión independiente del diff (otro modelo, solo lectura) y una ronda de arreglos. Merge solo con aprobación.

## Riesgos conocidos

- Romper el `key` del editor (I5): después de cambiar el rol, los permisos tienen que mostrar los del rol nuevo. Hay test; no borrarlo.
- Tests de interfaz sensibles a la carga (`nuevo-vehiculo-form`, `agregar-item-form`): si fallan en la suite completa, correrlos solos antes de concluir nada.
- `eslint` prohíbe `setState` dentro de `useEffect` (ver §7 del traspaso): para "Descartar", remontar con `key` o ajustar estado en render.
