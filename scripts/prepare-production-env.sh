#!/usr/bin/env bash
# Prepara el .env de producción en la EC2 a partir de .env.production.example.
#
#   OO_EMAIL=tu@correo.com bash scripts/prepare-production-env.sh
#
# - Respalda el .env actual en .env.backup.<fecha>.
# - CONSERVA del .env actual: credenciales de Postgres SIEMPRE (aunque sean las de ejemplo: el
#   volumen de la BD ya se creó con esa contraseña), JWT_SECRET y datos del admin.
# - Si la BD ya existe y no hay contraseña que conservar, se detiene en vez de inventar una.
# - Valida el correo y la contraseña de OpenObserve con sus reglas antes de terminar.
# - Toma el resto de .env.production.example (perfil observability, OTEL, OpenObserve...).
# - OpenObserve: usa OO_EMAIL / OO_PASSWORD si se pasan; si no hay contraseña, genera una aleatoria.
# - Genera JWT_SECRET si no existía.
set -euo pipefail

cd "$(dirname "$0")/.."
EXAMPLE=.env.production.example
TARGET=.env
PRESERVE=(JWT_SECRET ADMIN_NAME ADMIN_EMAIL ADMIN_PASSWORD ZO_ROOT_USER_EMAIL ZO_ROOT_USER_PASSWORD)
# Credenciales de Postgres: se conservan SIEMPRE, aunque sean las de ejemplo. El volumen de la BD
# guarda la contraseña con la que se inicializó; cambiarla solo en .env rompe el backend con
# "password authentication failed". Para cambiarla hay que hacer también ALTER USER en Postgres.
PG_KEYS=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB)
DB_VOLUME="${COMPOSE_PROJECT_NAME:-pruebas-final}_db_data"
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
PG_PRESERVED=0
if [[ -f "$TARGET" ]]; then
  OLD=".env.backup.$(date +%Y%m%d-%H%M%S)"
  cp "$TARGET" "$OLD"
  chmod 600 "$OLD"
  echo ">> Respaldo del .env actual: $OLD"
fi

cp "$EXAMPLE" "$TARGET"

if [[ -n "$OLD" ]]; then
  for key in "${PG_KEYS[@]}"; do
    value="$(get_value "$key" "$OLD")"
    if [[ -n "$value" ]]; then
      set_value "$key" "$value"
      echo "   conservado: $key"
      [[ "$key" == POSTGRES_PASSWORD ]] && PG_PRESERVED=1
      if [[ "$key" == POSTGRES_PASSWORD && "$value" =~ $WEAK_VALUES ]]; then
        echo "   !! POSTGRES_PASSWORD es la de ejemplo; se conserva porque la BD existente la usa." >&2
      fi
    fi
  done
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
  set_value ZO_ROOT_USER_PASSWORD "Oo-9$(random_secret 24 24)"
  echo "   generada: ZO_ROOT_USER_PASSWORD (consúltala con: grep ZO_ROOT_USER_PASSWORD .env)"
fi

# Secretos que falten
if [[ "$(get_value JWT_SECRET "$TARGET")" =~ $WEAK_VALUES ]]; then
  set_value JWT_SECRET "$(openssl rand -hex 48)"
  echo "   generado: JWT_SECRET"
fi
# Solo se genera si NO había contraseña previa (BD nueva); una conservada nunca se reemplaza
if (( ! PG_PRESERVED )) && [[ "$(get_value POSTGRES_PASSWORD "$TARGET")" =~ $WEAK_VALUES ]]; then
  if docker volume inspect "$DB_VOLUME" >/dev/null 2>&1; then
    echo "!! El volumen $DB_VOLUME ya existe y no hay POSTGRES_PASSWORD que conservar." >&2
    echo "   Pon en .env la contraseña ORIGINAL de la BD (revisa los .env.backup.*); no se genera una nueva." >&2
    exit 3
  fi
  set_value POSTGRES_PASSWORD "$(random_secret 24 24)"
  echo "   generada: POSTGRES_PASSWORD (BD nueva)"
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
# OpenObserve se reinicia en bucle si el correo o la contraseña no cumplen sus reglas
ZO_EMAIL_RE='^[a-z0-9_+]([a-z0-9_+.-]*[a-z0-9_+])?@[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]{2,}$'
zo_email="$(get_value ZO_ROOT_USER_EMAIL "$TARGET")"
zo_pass="$(get_value ZO_ROOT_USER_PASSWORD "$TARGET")"
invalid=0
if [[ ! "$zo_email" =~ $ZO_EMAIL_RE ]]; then
  echo "!! ZO_ROOT_USER_EMAIL no es un correo válido para OpenObserve (minúsculas, sin comillas, con dominio)." >&2
  invalid=1
fi
if (( ${#zo_pass} < 8 || ${#zo_pass} > 128 )) \
   || [[ ! "$zo_pass" =~ [a-z] || ! "$zo_pass" =~ [A-Z] || ! "$zo_pass" =~ [0-9] || ! "$zo_pass" =~ [^a-zA-Z0-9] ]]; then
  echo "!! ZO_ROOT_USER_PASSWORD es demasiado débil para OpenObserve: 8-128 caracteres con minúscula, mayúscula, dígito y símbolo." >&2
  invalid=1
fi
if (( invalid )); then
  echo "   Corrígelo con: nano .env   (y usa los mismos valores en los secrets de GitHub)" >&2
  exit 4
fi

if grep -qE '^[A-Z_]+=.*\$' "$TARGET"; then
  echo "!! Algún valor contiene '\$': docker compose lo interpretaría como variable. Escríbelo como '\$\$'." >&2
fi

echo
echo ">> .env listo. Variables de OpenObserve que van también en los secrets de GitHub:"
echo "   OPENOBSERVE_USER     = $(get_value ZO_ROOT_USER_EMAIL "$TARGET")"
echo "   OPENOBSERVE_PASSWORD = (grep ZO_ROOT_USER_PASSWORD .env)"
