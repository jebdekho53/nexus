#!/bin/sh
set -eu
test -f /srv/edge/Caddyfile
cp /srv/edge/Caddyfile /srv/edge/Caddyfile.before-matrix
if ! grep -q '^matrix.vaidya-gpt.com {' /srv/edge/Caddyfile; then
  cat /srv/matrix/matrix.caddy >> /srv/edge/Caddyfile
fi
if ! docker exec edge-caddy caddy validate --config /etc/caddy/Caddyfile; then
  cat /srv/edge/Caddyfile.before-matrix > /srv/edge/Caddyfile
  exit 1
fi
docker exec edge-caddy caddy reload --config /etc/caddy/Caddyfile
