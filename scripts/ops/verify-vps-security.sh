#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/opt/lancar/secrets/.env.production}"
API_BASE_URL="${API_BASE_URL:-}"

failures=0
warnings=0
compose_config_file=""

cleanup() {
  if [[ -n "$compose_config_file" && -f "$compose_config_file" ]]; then
    shred -u "$compose_config_file" 2>/dev/null || rm -f "$compose_config_file"
  fi
}
trap cleanup EXIT

info() {
  printf '[INFO] %s\n' "$*"
}

pass() {
  printf '[PASS] %s\n' "$*"
}

warn() {
  warnings=$((warnings + 1))
  printf '[WARN] %s\n' "$*"
}

fail() {
  failures=$((failures + 1))
  printf '[FAIL] %s\n' "$*"
}

require_file() {
  local path="$1"
  local label="$2"
  if [[ -f "$path" ]]; then
    pass "$label exists: $path"
  else
    fail "$label is missing: $path"
  fi
}

require_command() {
  local command_name="$1"
  if command -v "$command_name" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

check_env_file_permissions() {
  if [[ ! -f "$ENV_FILE" ]]; then
    fail "production env file is missing: $ENV_FILE"
    return
  fi

  local mode owner
  mode="$(stat -c '%a' "$ENV_FILE")"
  owner="$(stat -c '%U:%G' "$ENV_FILE")"

  if [[ "$mode" == "600" || "$mode" == "640" ]]; then
    pass "production env permissions are restricted: $mode $owner"
  else
    fail "production env permissions must be 600 or 640, got $mode $owner"
  fi
}

check_git_env_history() {
  if git -C "$REPO_ROOT" log --all --full-history -- .env --format='%H' | grep -q .; then
    fail ".env appears in git history. Rotate all exposed secrets and purge history before production."
  else
    pass ".env is not present in git history"
  fi
}

check_tracked_secret_and_artifact_files() {
  local tracked_google_services
  tracked_google_services="$(git -C "$REPO_ROOT" ls-files -- '**/google-services.json' || true)"
  if [[ -n "$tracked_google_services" ]]; then
    fail "real google-services.json files are tracked: $(echo "$tracked_google_services" | tr '\n' ' ')"
  else
    pass "real google-services.json files are not tracked"
  fi

  local tracked_artifacts
  tracked_artifacts="$(git -C "$REPO_ROOT" ls-files | grep -E '(^|/)(auth-api|auth-service\.exe|auth_service_test\.exe|payment-api|gosec-report)$' || true)"
  if [[ -n "$tracked_artifacts" ]]; then
    fail "build artifacts are tracked: $(echo "$tracked_artifacts" | tr '\n' ' ')"
  else
    pass "known build artifacts are not tracked"
  fi
}

check_gitleaks() {
  if require_command gitleaks; then
    if gitleaks detect --source "$REPO_ROOT" --redact --no-banner; then
      pass "gitleaks detect passed"
    else
      fail "gitleaks detected possible secrets"
    fi
  else
    warn "gitleaks is not installed; install it on the VPS or run the CI secret audit"
  fi
}

check_trivy() {
  if require_command trivy; then
    if trivy fs --quiet --severity HIGH,CRITICAL --exit-code 1 "$REPO_ROOT"; then
      pass "trivy fs high/critical scan passed"
    else
      fail "trivy found high/critical issues"
    fi
  else
    warn "trivy is not installed; install it on the VPS or rely on the CI container security gate"
  fi
}

render_compose_config() {
  if [[ ! -f "$COMPOSE_FILE" || ! -f "$ENV_FILE" ]]; then
    return 1
  fi

  compose_config_file="$(mktemp)"
  chmod 600 "$compose_config_file"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >"$compose_config_file"
}

check_compose_config() {
  if ! require_command docker; then
    fail "docker is not installed"
    return
  fi

  if ! render_compose_config; then
    fail "docker compose config could not be rendered"
    return
  fi

  pass "docker compose production config renders successfully"

  local weak_patterns='lancar_secret_key_change_me|changeme|guest:guest|POSTGRES_PASSWORD: 1234|postgres:1234|password=1234|PASSWORD_RAW|PASSWORD_URL_ENCODED|REDIS_PASSWORD_URL_ENCODED|RABBITMQ_PASSWORD_URL_ENCODED'
  if grep -Eiq "$weak_patterns" "$compose_config_file"; then
    fail "compose config still contains weak/default placeholder secret values"
  else
    pass "compose config does not contain known weak/default secret markers"
  fi

  local public_internal_ports
  public_internal_ports="$(awk '
    /^[[:space:]]{2}[A-Za-z0-9_-]+:$/ {
      service=$1
      gsub(":", "", service)
      internal = service ~ /^(db|redis|rabbitmq|auth-service|routing-service|order-service|payment-service|admin-service)$/
    }
    /^[[:space:]]{4}ports:$/ && internal { print service }
  ' "$compose_config_file" || true)"

  if [[ -n "$public_internal_ports" ]]; then
    fail "internal services expose host ports: $(echo "$public_internal_ports" | tr '\n' ' ')"
  else
    pass "db, redis, rabbitmq, and internal services do not expose host ports"
  fi
}

check_live_health() {
  if [[ -z "$API_BASE_URL" ]]; then
    warn "API_BASE_URL is not set; skipping live gateway health and CORS checks"
    return
  fi

  if curl -fsS "$API_BASE_URL/health" >/dev/null; then
    pass "gateway health endpoint responded: $API_BASE_URL/health"
  else
    fail "gateway health endpoint failed: $API_BASE_URL/health"
  fi

  local cors_headers
  cors_headers="$(mktemp)"
  if curl -fsS -D "$cors_headers" -o /dev/null \
    -X OPTIONS "$API_BASE_URL/api/v1/orders" \
    -H 'Origin: https://attacker.invalid' \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: x-user-role' >/dev/null 2>&1; then
    if grep -iq 'access-control-allow-headers:.*x-user-role' "$cors_headers"; then
      rm -f "$cors_headers"
      fail "CORS preflight allows x-user-role from an unknown origin"
    else
      rm -f "$cors_headers"
      pass "CORS preflight does not allow x-user-role"
    fi
  else
    rm -f "$cors_headers"
    pass "CORS preflight from unknown origin was rejected"
  fi
}

main() {
  info "LANCAR VPS security verification"
  info "repo: $REPO_ROOT"
  info "compose: $COMPOSE_FILE"
  info "env: $ENV_FILE"

  require_file "$COMPOSE_FILE" "production compose file"
  check_env_file_permissions
  check_git_env_history
  check_tracked_secret_and_artifact_files
  check_gitleaks
  check_trivy
  check_compose_config
  check_live_health

  printf '\nSummary: %s failure(s), %s warning(s)\n' "$failures" "$warnings"
  if [[ "$failures" -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
