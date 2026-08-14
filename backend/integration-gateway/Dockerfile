# ============================================================
# Integration Gateway — Multi-Stage Dockerfile (Hardened)
# ============================================================

# Stage 1: Builder
FROM golang:1.25.13-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Copy dependency files first (better layer caching)
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Copy source
COPY . .

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
