#!/usr/bin/env bash
# Builds the web version of the app and publishes it at https://<domain>/app/.
#   scripts/deploy-web.sh root@94.184.32.14
# nginx (dawshia-server/deploy/docker/setup-nginx.sh) serves /opt/dawshia/web/app.
set -euo pipefail

HOST=${1:?usage: deploy-web.sh user@host}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$ROOT/dist/web/app

rm -rf "$ROOT/dist/web"
(cd "$ROOT" && npx expo export --platform web --output-dir "$OUT")
ssh "$HOST" 'mkdir -p /opt/dawshia/web/app'
rsync -az --delete --no-owner --no-group "$OUT/" "$HOST:/opt/dawshia/web/app/"
echo "Web app deployed: /app/ on $HOST"
