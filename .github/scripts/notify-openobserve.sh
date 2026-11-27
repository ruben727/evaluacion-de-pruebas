#!/usr/bin/env bash
# Envía un evento del pipeline a OpenObserve (stream "cicd_pipeline") por la API HTTP/JSON.
#
# Variables obligatorias:
#   OPENOBSERVE_URL       p.ej. http://3.145.142.235:5080
#   OPENOBSERVE_USER      usuario (correo) de OpenObserve
#   OPENOBSERVE_PASSWORD  contraseña de OpenObserve
#   EVENT_TYPE            "test" | "deploy"
#   RESULT                success | failure | cancelled | skipped
# Opcionales (las rellena GitHub Actions): COMMIT_SHA, COMMIT_MESSAGE, BRANCH, ACTOR, RUN_ID,
#   RUN_ATTEMPT, RUN_URL, EVENT_NAME, WORKFLOW, REPOSITORY, EXTRA_FIELDS (objeto JSON con campos extra)
#   OPENOBSERVE_ORG (default "default"), OPENOBSERVE_STREAM (default "cicd_pipeline")
set -euo pipefail

if [[ -z "${OPENOBSERVE_USER:-}" || -z "${OPENOBSERVE_PASSWORD:-}" || -z "${OPENOBSERVE_URL:-}" ]]; then
  # Por ejemplo en pull requests desde forks, donde GitHub no expone los secrets.
  echo "::warning::Credenciales de OpenObserve no disponibles; no se envía el evento."
  exit 0
fi

: "${EVENT_TYPE:?EVENT_TYPE es obligatorio}"
: "${RESULT:?RESULT es obligatorio}"

ORG="${OPENOBSERVE_ORG:-default}"
STREAM="${OPENOBSERVE_STREAM:-cicd_pipeline}"
ENDPOINT="${OPENOBSERVE_URL%/}/api/${ORG}/${STREAM}/_json"
COMMIT_SHA="${COMMIT_SHA:-}"
EXTRA_FIELDS="${EXTRA_FIELDS:-}"
[[ -n "$EXTRA_FIELDS" ]] || EXTRA_FIELDS="{}"

payload="$(jq -n \
  --arg type "$EVENT_TYPE" \
  --arg result "$RESULT" \
  --arg commit "$COMMIT_SHA" \
  --arg commit_short "${COMMIT_SHA:0:7}" \
  --arg commit_message "${COMMIT_MESSAGE:-}" \
  --arg branch "${BRANCH:-}" \
  --arg actor "${ACTOR:-}" \
  --arg run_id "${RUN_ID:-}" \
  --arg run_attempt "${RUN_ATTEMPT:-1}" \
  --arg run_url "${RUN_URL:-}" \
  --arg event_name "${EVENT_NAME:-}" \
  --arg workflow "${WORKFLOW:-}" \
  --arg repository "${REPOSITORY:-}" \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson extra "$EXTRA_FIELDS" \
  '{
    type: $type,
    result: $result,
    success: ($result == "success"),
    commit: $commit,
    commit_short: $commit_short,
    commit_message: ($commit_message | split("\n")[0]),
    commit_message_full: $commit_message,
    branch: $branch,
    actor: $actor,
    run_id: $run_id,
    run_attempt: ($run_attempt | tonumber? // 1),
    run_url: $run_url,
    event_name: $event_name,
    workflow: $workflow,
    repository: $repository,
    timestamp: $timestamp
  } + $extra')"

echo "Enviando evento a OpenObserve (${STREAM}):"
echo "$payload" | jq .

curl --fail-with-body -sS \
  --retry 3 --retry-delay 5 --retry-all-errors \
  --connect-timeout 10 --max-time 30 \
  -u "${OPENOBSERVE_USER}:${OPENOBSERVE_PASSWORD}" \
  -H 'Content-Type: application/json' \
  -d "[${payload}]" \
  "$ENDPOINT"
echo
