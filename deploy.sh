#!/bin/bash
# Despliegue de TorqueFlow: siempre compila antes de reiniciar y reinicia en el
# PM2 del usuario de aplicacion (no en el de root).
set -e
cd /var/www/torqueflow
export PATH=/opt/node22/bin:$PATH
echo "1/6 Dependencias...";            npm install
echo "2/6 Prisma (public)...";         npx prisma generate
echo "3/6 Prisma (tenant)...";         npx prisma generate --schema=prisma/tenant/schema.prisma
echo "4/6 Build (next build)...";      npm run build
echo "5/6 Verificando build...";       test -f .next/BUILD_ID || { echo "ERROR: next build no genero .next/BUILD_ID"; exit 1; }
echo "6/6 Reiniciando en PM2 apps..."; sudo -u apps env PM2_HOME=/home/apps/.pm2 pm2 restart torqueflow --update-env
for i in $(seq 1 20); do
  if (exec 3<>/dev/tcp/127.0.0.1/3025) 2>/dev/null; then exec 3>&- 2>/dev/null; echo "✅ TorqueFlow arriba en 3025"; exit 0; fi
  sleep 2
done
echo "ERROR: TorqueFlow no responde en 3025"; sudo -u apps env PM2_HOME=/home/apps/.pm2 pm2 logs torqueflow --lines 20 --nostream; exit 1
