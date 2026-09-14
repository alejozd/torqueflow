# Despliegue / actualización en el servidor Ubuntu

Guía para actualizar una instalación de TorqueFlow ya corriendo en producción
(Postgres local en el mismo servidor, proceso administrado con PM2). No cubre
la instalación inicial desde cero.

## 1. Respaldo antes de tocar nada (crítico en producción)

```bash
pg_dump "$DATABASE_URL" > ~/backups/torqueflow_$(date +%Y%m%d_%H%M).sql
```

Usa la URL real de Postgres de producción (la del `.env` del servidor).

## 2. Traer el código nuevo

```bash
cd /ruta/a/torqueflow   # directorio de la app en el servidor
git status              # confirma que no hay cambios locales sin commitear
git pull origin main
```

## 3. Dependencias y clientes de Prisma

```bash
npm ci
npx prisma generate --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/tenant/schema.prisma
```

`src/generated/` no se versiona en git — hay que regenerar ambos clientes
(schema público y schema de tenant) en cada despliegue.

## 4. Migrar el schema público

```bash
npx prisma migrate deploy --schema=prisma/schema.prisma
```

## 5. Migrar **cada** tenant existente

Cada tenant vive en su propio schema de Postgres. No asumas cuántos hay ni
cuáles — pregúntale a la tabla `tenants` y recorre todos:

```bash
psql "$DATABASE_URL" -Atc "SELECT schema_name FROM tenants;" | while read -r schema; do
  echo "Migrando tenant: $schema"
  TENANT_DATABASE_URL="${TENANT_DATABASE_BASE_URL}?schema=${schema}" \
    npx prisma migrate deploy --schema=prisma/tenant/schema.prisma
done
```

## 6. Backfill de ítems del checklist DVI

```bash
npm run tenant:backfill-dvi-checklist-items
```

Seguro de re-ejecutar: se salta los tenants que ya tienen ítems (ver
`scripts/backfill-dvi-checklist-items.ts`). Corre este paso en cada
despliegue mientras no haya certeza de que todos los tenants reales ya
recibieron el backfill.

## 7. Compilar

```bash
npm run build
```

## 8. Reiniciar con PM2

```bash
pm2 list                         # confirma el nombre exacto del proceso
pm2 restart torqueflow           # o `pm2 reload torqueflow` en modo cluster (sin downtime)
pm2 logs torqueflow --lines 50   # revisa que arrancó sin errores
```

## 9. Verificar

- Abrir la app y entrar a una orden con checklist DVI: confirmar que el
  toggle "Ver ítems desactivados" y el selector de mecánico se ven bien.
- Revisar `pm2 logs` unos minutos por si hay errores de conexión a Postgres
  o de Prisma.

---

**Cuándo saltarse los pasos 4-6:** solo si estás seguro de que el despliegue
anterior ya aplicó todas las migraciones de tenant pendientes y el backfill
correspondiente. Son idempotentes (no hacen daño si ya se ejecutaron), así
que ante la duda, mejor correrlos.
