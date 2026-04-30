# ============================================================
# LANCAR — Makefile
# Shortcuts untuk task development sehari-hari
# ============================================================

.PHONY: help dev stop down reset migrate seed test lint logs ps shell-db

## ─────────────────────────────────────────────
## DEFAULT
## ─────────────────────────────────────────────
help: ## Tampilkan semua command yang tersedia
	@echo ""
	@echo "  LANCAR — Available Commands"
	@echo "  ─────────────────────────────────────────"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

## ─────────────────────────────────────────────
## DOCKER
## ─────────────────────────────────────────────
dev: ## Start semua services (DB + Redis + semua backend)
	docker compose up -d --build
	@echo ""
	@echo "  ✅ Services running:"
	@echo "  Auth Service   → http://localhost:8081"
	@echo "  Admin Service  → http://localhost:3000"
	@echo "  Routing Svc    → http://localhost:8082"
	@echo ""

stop: ## Stop semua services (tanpa hapus data)
	docker compose stop

down: ## Stop dan hapus containers (data tetap ada)
	docker compose down

reset: ## ⚠️  HAPUS SEMUA DATA dan restart dari awal
	@echo "⚠️  WARNING: Ini akan menghapus semua data database!"
	@read -p "Lanjutkan? (y/N): " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose down -v
	docker compose up -d --build

tools: ## Start services + Redis Commander UI (port 8085)
	docker compose --profile tools up -d

ps: ## Lihat status semua containers
	docker compose ps

logs: ## Tail logs semua services (Ctrl+C untuk stop)
	docker compose logs -f

logs-auth: ## Tail logs auth-service saja
	docker compose logs -f auth-service

logs-admin: ## Tail logs admin-service saja
	docker compose logs -f admin-service

logs-db: ## Tail logs database saja
	docker compose logs -f db

## ─────────────────────────────────────────────
## DATABASE
## ─────────────────────────────────────────────
migrate: ## Jalankan semua migration pending (via goose lokal)
	goose -dir database/migrations postgres "$(DATABASE_URL)" up

migrate-status: ## Lihat status semua migration
	goose -dir database/migrations postgres "$(DATABASE_URL)" status

migrate-down: ## Rollback migration terakhir
	goose -dir database/migrations postgres "$(DATABASE_URL)" down

migrate-reset: ## ⚠️  Rollback SEMUA migration (hapus semua tabel)
	goose -dir database/migrations postgres "$(DATABASE_URL)" reset

migrate-docker: ## Jalankan migration via Docker (tidak perlu goose di lokal)
	docker compose --profile migrate run --rm migrate

shell-db: ## Buka psql shell ke database
	docker compose exec db psql -U postgres -d lancar

## ─────────────────────────────────────────────
## TESTING
## ─────────────────────────────────────────────
test: ## Jalankan semua tests
	@echo "→ Auth Service tests..."
	cd backend/auth-service && go test -v -timeout 5m ./...
	@echo "→ Admin Service tests..."
	cd backend/admin-service && npm test
	@echo "→ Routing Service tests..."
	cd backend/routing-service && go test -v -timeout 5m ./...

test-auth: ## Test auth-service saja
	cd backend/auth-service && go test -v -timeout 5m ./...

test-admin: ## Test admin-service saja
	cd backend/admin-service && npm test

test-coverage: ## Test dengan coverage report (auth-service)
	cd backend/auth-service && go test -v -coverprofile=coverage.out ./... && go tool cover -html=coverage.out

## ─────────────────────────────────────────────
## LINTING & SECURITY
## ─────────────────────────────────────────────
lint: ## Jalankan semua linter
	@echo "→ Go lint (auth-service)..."
	cd backend/auth-service && go vet ./...
	@echo "→ Go lint (routing-service)..."
	cd backend/routing-service && go vet ./...
	@echo "→ Node lint (admin-service)..."
	cd backend/admin-service && npm run lint || true
	@echo "→ Node lint (frontend)..."
	cd frontend && npm run lint || true

sec-audit: ## Security audit Node.js dependencies
	cd frontend && npm audit --audit-level=high || true
	cd backend/admin-service && npm audit --audit-level=high || true

sec-go: ## Security scan Go code dengan gosec (butuh: go install github.com/securego/gosec/v2/cmd/gosec@latest)
	gosec ./backend/auth-service/...
	gosec ./backend/routing-service/...

## ─────────────────────────────────────────────
## BUILD
## ─────────────────────────────────────────────
build-auth: ## Build binary auth-service
	cd backend/auth-service && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o auth-service ./cmd/api/main.go

build-routing: ## Build binary routing-service
	cd backend/routing-service && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o routing-service ./main.go

build-docker: ## Build semua Docker images lokal
	docker compose build

## ─────────────────────────────────────────────
## UTILITIES
## ─────────────────────────────────────────────
tidy: ## go mod tidy untuk semua Go services
	cd backend/auth-service && go mod tidy
	cd backend/routing-service && go mod tidy

setup: ## First-time setup: copy .env, start services, migrate
	@if [ ! -f .env ]; then cp .env.example .env && echo "✅ .env dibuat dari .env.example"; fi
	$(MAKE) dev
	@echo "⏳ Menunggu DB siap..."
	sleep 10
	$(MAKE) migrate
	@echo ""
	@echo "🚀 LANCAR dev environment siap!"
