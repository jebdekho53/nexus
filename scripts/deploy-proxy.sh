#!/bin/sh
set -eu
test -f /srv/edge/Caddyfile
cp /srv/edge/Caddyfile /srv/edge/Caddyfile.before-nexus
if ! grep -q '^nexus.vaidya-gpt.com {' /srv/edge/Caddyfile; then
  cat /srv/nexus/nexus.caddy >> /srv/edge/Caddyfile
fi
if ! docker exec edge-caddy caddy validate --config /etc/caddy/Caddyfile; then
  cat /srv/edge/Caddyfile.before-nexus > /srv/edge/Caddyfile
  exit 1
fi
docker exec edge-caddy caddy reload --config /etc/caddy/Caddyfile
