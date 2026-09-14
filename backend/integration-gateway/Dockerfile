# ============================================================
# Integration Gateway — Multi-Stage Dockerfile (Hardened)
# ============================================================

# Stage 1: Builder
FROM golang:1.26.6-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app/integration-gateway

# Copy dependency files first (better layer caching)
COPY integration-gateway/go.mod integration-gateway/go.sum ./
# The integration gateway imports the shared resilience module. The Docker
# context is the backend root so the local replace target is present in the
# builder and cannot silently fall back to an unverified dependency.
COPY pkg/resilience /app/pkg/resilience
# `tembus/pkg/resilience` is a checked-in local replace and therefore has no
# module-cache ziphash for `go mod verify`; the external module download still
# runs here, while the local module is copied from the same build context.
RUN go mod download

# Copy source
COPY integration-gateway/ .

# Build: CGO disabled, stripped binary (-s -w = no debug info, smaller size)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -ldflags="-s -w -extldflags '-static'" \
    -trimpath \
    -o /bin/integration-gateway \
    ./cmd/api/main.go

# Stage 2: Final (minimal attack surface)
FROM alpine:3.22

# Security patch: upgrade all packages to get latest CVE fixes
RUN apk upgrade --no-cache

# Security: add ca-certs + timezone data
RUN apk --no-cache add ca-certificates tzdata && \
    # Create non-root user
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    # Create app directory
    mkdir -p /app && chown appuser:appgroup /app

WORKDIR /app

# Copy binary from builder
COPY --from=builder --chown=appuser:appgroup /bin/integration-gateway /app/integration-gateway

# Execute as non-root user
USER appuser:appgroup

# Inform Docker that this container listens on INTEGRATION_GATEWAY_PORT (default 8085)
EXPOSE 8085

# Healthcheck
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8085/health || exit 1

# Run the binary
ENTRYPOINT ["/app/integration-gateway"]
