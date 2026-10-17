# Fase 26 — Pasos para aplicar las migraciones (cierre)

> Solo con aprobación explícita del usuario. Dev y prod comparten la misma base: lo que se aplique aquí
> queda aplicado para los dos. Contexto general en `docs/TRASPASO-AGENTES.md` §6.

## Qué se aplica

| Migración | Qué hace |
|---|---|
| `prisma/tenant/migrations/20261023120000_rol_jefe_taller` | `ALTER TYPE "Role" ADD VALUE 'JEFE_TALLER';` |
| `prisma/tenant/migrations/20261024120000_permisos_usuario` | agrega `permisos_agregados` y `permisos_quitados` (`TEXT[]`, por defecto vacío) a `usuarios` |

Las dos son compatibles hacia atrás: el código que hoy corre en el servidor sigue funcionando con la base ya
migrada. **Al revés no**: el código nuevo lee `permisos_agregados` / `permisos_quitados` en cada petición
(`requireSession`), así que si arranca contra un schema sin migrar, nadie de ese taller puede entrar.

**Orden obligatorio: respaldo → migrar TODOS los schemas → comprobar → merge → desplegar.**

## 1. Respaldo (en el servidor)

```bash
cd /var/www/torqueflow
set -a; . ./.env; set +a
mkdir -p ~/backups
pg_dump "${DATABASE_URL%%\?*}" > ~/backups/torqueflow_$(date +%Y%m%d_%H%M)_pre_fase26.sql
ls -lh ~/backups | tail -3   # que el archivo exista y no pese 0
```

## 2. Listar los schemas de tenant (de la base, no de memoria)

```bash
psql "${DATABASE_URL%%\?*}" -At -c "select schema_name from public.tenants order by schema_name"
```

Anotar la lista. Si `taller_dev_reference` no aparece, se agrega a mano a la lista.

## 3. Aplicar las migraciones a cada schema

Desde un checkout que tenga las migraciones nuevas (la rama `fase26-permisos`, o `main` después del merge):

```bash
for S in $(psql "${DATABASE_URL%%\?*}" -At -c "select schema_name from public.tenants") taller_dev_reference; do
  echo "== $S"
  TENANT_DATABASE_URL="${TENANT_DATABASE_BASE_URL}?schema=$S" \
    npx prisma migrate deploy --schema=prisma/tenant/schema.prisma
done
```

Si un schema falla, **parar ahí** y no desplegar. Se reporta el error y se decide; el respaldo del paso 1
sirve para volver atrás.

## 4. Comprobar cada schema

```bash
for S in $(psql "${DATABASE_URL%%\?*}" -At -c "select schema_name from public.tenants") taller_dev_reference; do
  echo "== $S"
  URL="${TENANT_DATABASE_BASE_URL}?schema=$S"
  TENANT_DATABASE_URL="$URL" npx prisma migrate diff \
    --from-url "$URL" --to-schema-datamodel prisma/tenant/schema.prisma --script
done
```

Cada uno tiene que responder **"This is an empty migration"**. (La variable `TENANT_DATABASE_URL` hace
falta: sin ella el diff compara contra `public` y parece un desfase que no existe; ver §7 del traspaso.)

## 5. Merge y despliegue

1. `git merge --no-ff fase26-permisos` a `main` y push (desde el portátil).
2. En el servidor: `sudo git pull` y luego **`sudo ./deploy.sh`** (hace `npm install`, los dos
   `prisma generate`, `npm run build` y `pm2 restart`). Si hubo un build fallido antes: `sudo rm -rf .next`.
3. Entrar con un usuario de cada rol (ADMIN, RECEPCION, TECNICO) y confirmar que inicia sesión.

## Si algo sale mal

- **Falla el login de un taller después de desplegar** → casi seguro es un schema sin migrar: correr el
  paso 3 y el 4 para ese schema.
- **Volver atrás del todo** → restaurar el respaldo del paso 1 y desplegar el `main` anterior. Ojo: el
  valor `JEFE_TALLER` de un enum de Postgres no se puede quitar con una migración simple; con el respaldo sí.
