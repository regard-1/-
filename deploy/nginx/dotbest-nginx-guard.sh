#!/usr/bin/env bash
set -euo pipefail

PDP_CONF="/opt/pdp-release/deploy/nginx/conf.d/pdp.conf"
DOTBEST_LOC="/opt/pdp-release/deploy/nginx/conf.d/dotbest-ops.loc"
STABLE_LOC="/opt/dotbest-ops/deploy/nginx/dotbest-ops.loc"
NGINX_CONTAINER="pdp-nginx"
LOG_FILE="/var/log/dotbest-nginx-guard.log"
LOCK_FILE="/run/dotbest-nginx-guard.lock"

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

log() {
    printf '%s | %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"
}

changed=0

if ! cmp -s "$STABLE_LOC" "$DOTBEST_LOC"; then
    install -m 0644 "$STABLE_LOC" "$DOTBEST_LOC"
    changed=1
    log "restored dotbest-ops.loc"
fi

if ! grep -qE '^[[:space:]]*include[[:space:]]+/etc/nginx/conf\.d/dotbest-ops\.loc;' "$PDP_CONF"; then
    backup="$(mktemp)"
    cp "$PDP_CONF" "$backup"
    patched="$(mktemp)"
    awk '
        BEGIN { inserted = 0 }
        !inserted && $0 ~ /^[[:space:]]*location[[:space:]]/ {
            print "    include /etc/nginx/conf.d/dotbest-ops.loc;"
            print ""
            inserted = 1
        }
        { print }
    ' "$PDP_CONF" > "$patched"
    install -m 0644 "$patched" "$PDP_CONF"
    rm -f "$patched"
    changed=1
    log "restored dotbest-ops include in pdp.conf"

    if ! docker exec "$NGINX_CONTAINER" nginx -t >/dev/null 2>&1; then
        install -m 0644 "$backup" "$PDP_CONF"
        rm -f "$backup"
        log "nginx validation failed; restored previous pdp.conf"
        exit 1
    fi
    rm -f "$backup"
fi

if [ "$changed" -eq 1 ]; then
    docker exec "$NGINX_CONTAINER" nginx -s reload >/dev/null 2>&1
    log "nginx reloaded"
fi
