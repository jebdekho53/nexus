#!/bin/sh
set -eu
SOURCE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="/srv/matrix-logo-backup-$STAMP.tar.gz"
test -f "$SOURCE/assets/matrix-logo.svg"
if command -v docker >/dev/null 2>&1 && docker inspect matrix-service >/dev/null 2>&1; then
  docker exec matrix-service tar -czf - -C /app assets admin > "$BACKUP"
  for item in matrix-logo.svg matrix-mark.png matrix-logo.jpg matrix.ico; do
    docker cp "$SOURCE/assets/$item" "matrix-service:/app/assets/$item"
  done
  docker cp "$SOURCE/refresh-logo-refs.cjs" matrix-service:/tmp/refresh-logo-refs.cjs
  docker exec -u 0 matrix-service node /tmp/refresh-logo-refs.cjs /app
  # Persist assets in the source used for the next image rebuild when present.
  if test -f /srv/matrix/server.cjs; then
    cp "$SOURCE"/assets/matrix* /srv/matrix/assets/
    node "$SOURCE/refresh-logo-refs.cjs" /srv/matrix
  fi
elif test -f /srv/matrix/server.cjs; then
  tar -czf "$BACKUP" -C /srv/matrix assets admin
  cp "$SOURCE"/assets/matrix* /srv/matrix/assets/
  node "$SOURCE/refresh-logo-refs.cjs" /srv/matrix
else
  echo 'Matrix service directory/container not found; nothing changed.' >&2
  exit 1
fi
echo "Logo update applied. Backup: $BACKUP"
echo 'No account, key, customer or payment data was changed.'
