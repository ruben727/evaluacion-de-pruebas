#!/bin/sh
# Sonda de temperatura del host.
#
# Busca sensores en las rutas estándar de Linux (montadas desde el host en /hostfs/sys):
#   /sys/class/thermal/thermal_zone*/temp     (miligrados Celsius)
#   /sys/class/hwmon/hwmon*/temp*_input       (miligrados Celsius)
#
# - Si encuentra sensores, envía cada lectura al stream "host_temperature" de OpenObserve.
# - Si no hay ninguno (lo normal en EC2: la VM no ve los sensores físicos del hipervisor Nitro),
#   envía un evento "sensor_available=false" cada hora para que quede documentado en OpenObserve.
#
# Variables: OO_URL, ZO_ROOT_USER_EMAIL, ZO_ROOT_USER_PASSWORD, PROBE_INTERVAL (segundos)

SYS_ROOT="${SYS_ROOT:-/hostfs/sys}"
INTERVAL="${PROBE_INTERVAL:-60}"
NO_SENSOR_REPORT_EVERY=3600
STREAM_URL="${OO_URL:-http://openobserve:5080}/api/default/host_temperature/_json"
HOST="$(cat /hostfs/etc/hostname 2>/dev/null || hostname)"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) thermal-probe: $*"; }

send() {
  curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
    -u "${ZO_ROOT_USER_EMAIL}:${ZO_ROOT_USER_PASSWORD}" \
    -H 'Content-Type: application/json' \
    -d "$1" "$STREAM_URL" 2>/dev/null
}

# Imprime una línea JSON por sensor encontrado
read_sensors() {
  for zone in "$SYS_ROOT"/class/thermal/thermal_zone*; do
    [ -r "$zone/temp" ] || continue
    raw="$(cat "$zone/temp" 2>/dev/null)" || continue
    case "$raw" in '' | *[!0-9-]*) continue ;; esac
    type="$(cat "$zone/type" 2>/dev/null || echo unknown)"
    printf '{"host":"%s","source":"thermal_zone","sensor":"%s","type":"%s","celsius":%s,"sensor_available":true}\n' \
      "$HOST" "$(basename "$zone")" "$type" "$(awk "BEGIN{printf \"%.1f\", $raw/1000}")"
  done
  for input in "$SYS_ROOT"/class/hwmon/hwmon*/temp*_input; do
    [ -r "$input" ] || continue
    raw="$(cat "$input" 2>/dev/null)" || continue
    case "$raw" in '' | *[!0-9-]*) continue ;; esac
    dir="$(dirname "$input")"
    name="$(cat "$dir/name" 2>/dev/null || echo unknown)"
    printf '{"host":"%s","source":"hwmon","sensor":"%s/%s","type":"%s","celsius":%s,"sensor_available":true}\n' \
      "$HOST" "$(basename "$dir")" "$(basename "$input")" "$name" "$(awk "BEGIN{printf \"%.1f\", $raw/1000}")"
  done
}

log "iniciando (intervalo ${INTERVAL}s, raíz ${SYS_ROOT}, host ${HOST})"
last_no_sensor=0

while true; do
  readings="$(read_sensors)"
  now="$(date +%s)"

  if [ -n "$readings" ]; then
    payload="[$(echo "$readings" | paste -sd, -)]"
    code="$(send "$payload")"
    log "$(echo "$readings" | wc -l | tr -d ' ') lectura(s) enviada(s) (HTTP ${code})"
  elif [ $((now - last_no_sensor)) -ge "$NO_SENSOR_REPORT_EVERY" ]; then
    zones="$(find "$SYS_ROOT/class/thermal" -maxdepth 1 -name 'thermal_zone*' 2>/dev/null | wc -l | tr -d ' ')"
    hwmons="$(find "$SYS_ROOT/class/hwmon" -maxdepth 1 -name 'hwmon*' 2>/dev/null | wc -l | tr -d ' ')"
    payload="$(printf '[{"host":"%s","source":"none","sensor_available":false,"thermal_zones":%s,"hwmon_devices":%s,"reason":"El kernel de la instancia no expone sensores de temperatura (virtualizacion EC2/Nitro)"}]' "$HOST" "$zones" "$hwmons")"
    code="$(send "$payload")"
    log "sin sensores de temperatura (thermal_zones=${zones}, hwmon=${hwmons}); evento registrado (HTTP ${code})"
    last_no_sensor="$now"
  fi

  sleep "$INTERVAL"
done
