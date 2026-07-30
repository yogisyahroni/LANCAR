#!/usr/bin/env bash
# ============================================================
# PRE-PUSH CHECKLIST — jalankan sebelum `git push`
# Menangkap error yang biasa lolos: lint, migration, test
# ============================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0
check()   { local n="$1"; shift; echo -e "\n${YELLOW}[$((PASS+FAIL+SKIP+1))] $n${NC}"; "$@" && { echo -e "  ${GREEN}✓${NC}"; PASS=$((PASS+1)); } || { echo -e "  ${RED}✗${NC}"; FAIL=$((FAIL+1)); }; }
skip()    { echo -e "\n${YELLOW}[$((PASS+FAIL+SKIP+1))] $1${NC}\n  ${YELLOW}⚠ SKIPPED — $2${NC}"; SKIP=$((SKIP+1)); }

echo "╔══════════════════════════════════════════════╗"
echo "║        PRE-PUSH VALIDATION CHECKLIST         ║"
echo "╚══════════════════════════════════════════════╝"

# ── 1. Go build ──────────────────────────────────────
check "Go Build (auth-service)" \
  sh -c "cd backend/auth-service && go build ./... 2>&1"

# ── 2. Go lint (golangci-lint: errcheck) ─────────────
if command -v golangci-lint &>/dev/null; then
  if golangci-lint run --disable-all --enable=errcheck ./backend/auth-service/... 2>&1; then
    echo -e "  ${GREEN}✓${NC}"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC}"
    FAIL=$((FAIL+1))
  fi
else
  skip "Go Lint - errcheck" "golangci-lint not installed (install: go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest)"
fi

# ── 3. Check migration version uniqueness ────────────
check "Migration version uniqueness" \
  sh -c "ls database/migrations/*.sql | sed 's/.*\///; s/^\([0-9]*\).*/\1/' | sort | uniq -d | grep -q . && { echo '  ❌ DUPLICATE VERSIONS:'; ls database/migrations/*.sql | sed 's/.*\///; s/^\([0-9]*\).*/\1/' | sort | uniq -d | while read v; do ls database/migrations/${v}*.sql | sed 's/.*\///'; done; exit 1; } || echo '  ✅ All unique'"

# ── 4. TypeScript lint (admin-dashboard) ─────────────
check "TS Build (admin-dashboard)" \
  sh -c "cd admin-dashboard && npx tsc --noEmit 2>&1"

# ── 5. TypeScript lint (admin-service) ───────────────
check "TS Build (admin-service)" \
  sh -c "cd backend/admin-service && npx tsc --noEmit 2>&1"

# ── Summary ───────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
if [ $FAIL -gt 0 ]; then
  echo -e "║  ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${SKIP} skipped${NC}           ║"
  echo "╚══════════════════════════════════════════════╝"
  exit 1
else
  echo -e "║  ${GREEN}${PASS} passed${NC}, ${YELLOW}${SKIP} skipped${NC}                     ║"
  echo "╚══════════════════════════════════════════════╝"
  exit 0
fi
