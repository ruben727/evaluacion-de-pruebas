#!/usr/bin/env bash
# Prepara el .env de producción en la EC2 a partir de .env.production.example.
#
#   OO_EMAIL=tu@correo.com bash scripts/prepare-production-env.sh
#
# - Respalda el .env actual en .env.backup.<fecha>.
# - CONSERVA del .env actual: credenciales de Postgres (obligatorio: el volumen de la BD
#   ya se creó con esa contraseña), JWT_SECRET y datos del admin.
# - Toma el resto de .env.production.example (perfil observability, OTEL, OpenObserve...).
# - OpenObserve: usa OO_EMAIL / OO_PASSWORD si se pasan; si no hay contraseña, genera una aleatoria.
# - Genera JWT_SECRET si no existía.
set -euo pipefail

cd "$(dirname "$0")/.."
EXAMPLE=.env.production.example
TARGET=.env
PRESERVE=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB JWT_SECRET ADMIN_NAME ADMIN_EMAIL ADMIN_PASSWORD ZO_ROOT_USER_EMAIL ZO_ROOT_USER_PASSWORD)
# Valores de ejemplo que NO deben conservarse en producción
WEAK_VALUES='^(root@example\.com|Complexpass#123|cambia-esta-clave|cambia-este-secreto-por-uno-largo-y-aleatorio|CAMBIAR.*)$'

[[ -f "$EXAMPLE" ]] || { echo "No existe $EXAMPLE (¿hiciste git pull?)" >&2; exit 1; }

random_secret() { openssl rand -base64 "$1" | tr -d '/+=\n' | cut -c1-"$2"; }

# Lee el valor de una clave de un archivo .env (sin interpretar el contenido)
get_value() { grep -E "^$1=" "$2" 2>/dev/null | tail -1 | cut -d= -f2- || true; }

# Reemplaza KEY=valor en $TARGET sin problemas con caracteres especiales (/ & | etc.)
set_value() {
  KEY="$1" VALUE="$2" awk -F= 'BEGIN{OFS="="} $1==ENVIRON["KEY"]{print ENVIRON["KEY"], ENVIRON["VALUE"]; next} {print}' \
    "$TARGET" > "$TARGET.tmp" && mv "$TARGET.tmp" "$TARGET"
}

OLD=""
if [[ -f "$TARGET" ]]; then
  OLD=".env.backup.$(date +%Y%m%d-%H%M%S)"
  cp "$TARGET" "$OLD"
  chmod 600 "$OLD"
  echo ">> Respaldo del .env actual: $OLD"
fi

cp "$EXAMPLE" "$TARGET"

if [[ -n "$OLD" ]]; then
  for key in "${PRESERVE[@]}"; do
    value="$(get_value "$key" "$OLD")"
    if [[ -n "$value" && ! "$value" =~ $WEAK_VALUES ]]; then
      set_value "$key" "$value"
      echo "   conservado: $key"
    fi
  done
fi

# OpenObserve
if [[ -n "${OO_EMAIL:-}" ]]; then set_value ZO_ROOT_USER_EMAIL "$OO_EMAIL"; fi
if [[ -n "${OO_PASSWORD:-}" ]]; then set_value ZO_ROOT_USER_PASSWORD "$OO_PASSWORD"; fi
if [[ "$(get_value ZO_ROOT_USER_PASSWORD "$TARGET")" =~ $WEAK_VALUES ]]; then
  set_value ZO_ROOT_USER_PASSWORD "Oo-$(random_secret 24 24)"
  echo "   generada: ZO_ROOT_USER_PASSWORD (consúltala con: grep ZO_ROOT_USER_PASSWORD .env)"
fi

# Secretos que falten
if [[ "$(get_value JWT_SECRET "$TARGET")" =~ $WEAK_VALUES ]]; then
  set_value JWT_SECRET "$(openssl rand -hex 48)"
  echo "   generado: JWT_SECRET"
fi
if [[ "$(get_value POSTGRES_PASSWORD "$TARGET")" =~ $WEAK_VALUES ]]; then
  set_value POSTGRES_PASSWORD "$(random_secret 24 24)"
  echo "   generada: POSTGRES_PASSWORD (solo válido si la BD es NUEVA; si ya existe, pon la contraseña original)"
fi
if [[ "$(get_value ADMIN_PASSWORD "$TARGET")" =~ $WEAK_VALUES ]]; then
  set_value ADMIN_PASSWORD "Adm-$(random_secret 18 16)"
  echo "   generada: ADMIN_PASSWORD"
fi

# Solo el dueño puede leer los secretos
chmod 600 "$TARGET"

# Comprobaciones finales
pending="$(grep -nE '=CAMBIAR' "$TARGET" || true)"
if [[ -n "$pending" ]]; then
  echo
  echo "!! Faltan valores por completar en .env (edítalo con: nano .env):"
  echo "$pending" | cut -d= -f1
  exit 2
fi
if grep -qE '^[A-Z_]+=.*\$' "$TARGET"; then
  echo "!! Algún valor contiene '\$': docker compose lo interpretaría como variable. Escríbelo como '\$\$'." >&2
fi

echo
echo ">> .env listo. Variables de OpenObserve que van también en los secrets de GitHub:"
echo "   OPENOBSERVE_USER     = $(get_value ZO_ROOT_USER_EMAIL "$TARGET")"
echo "   OPENOBSERVE_PASSWORD = (grep ZO_ROOT_USER_PASSWORD .env)"
