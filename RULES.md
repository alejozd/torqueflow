# Reglas de Operación para Claude Code

## 1. NO REINTENTOS AUTOMÁTICOS
- Si un test falla o un comando falla, NO reintentes automáticamente.
- Reporta el error y espera instrucciones del usuario.
- Máximo 1 intento de corrección por error. Si falla de nuevo, detente y reporta.

## 2. NO ESPERAR NOTIFICACIONES NI PROCESOS LENTOS
- Nunca te quedes esperando notificaciones, emuladores, o procesos que tomen más de 30 segundos.
- Si algo requiere espera, detente y pide al usuario que confirme cuando esté listo.
- NO uses timeouts largos ni loops de polling.

## 3. COMMITS ATÓMICOS POR TAREA
- Al completar CADA tarea, haz commit y push inmediato a main.
- Formato del commit: "task X: descripción breve"
- NO acumules cambios de varias tareas en un solo commit.
- Esto permite retomar fácilmente si se agotan los tokens.

## 4. VERIFICACIONES RÁPIDAS
- `tsc --noEmit` y tests solo al final de cada tarea, no durante el desarrollo.
- No ejecutes el servidor de desarrollo a menos que sea estrictamente necesario.
- Evita comandos que generen output masivo (usa `head`, `tail`, `grep`).

## 5. REPORTES CONCISOS
- Al terminar cada tarea: 3-5 líneas máximo (qué se hizo, commit hash, tests pasando).
- NO repitas el contenido del código en el reporte.
- NO hagas resúmenes extensos de lo que ya está en el código.

## 6. CUANDO SE ACERQUEN LOS LÍMITES
- Si detectas que estás cerca del límite de tokens, termina la tarea actual, 
  haz commit, y reporta el estado para retomar fácilmente.