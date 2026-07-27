# ============================================================
# Order Service — Multi-Stage Dockerfile (Hardened)
# ============================================================

# Stage 1: Builder
FROM mirror.gcr.io/golang:1.25.12-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Copy dependency files first
COPY go.mod go.sum* ./
RUN go mod tidy && go mod download && go mod verify

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -ldflags="-s -w -extldflags '-static'" \
    -trimpath \
    -o /bin/order-service \
    ./cmd/api/main.go

# Stage 2: Final
FROM mirror.gcr.io/alpine:3.22

# Security patch: upgrade all packages to get latest CVE fixes (CVE-2025-4544 libcrypto)
RUN apk upgrade --no-cache

RUN apk --no-cache add ca-certificates tzdata && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    mkdir -p /app && chown appuser:appgroup /app

WORKDIR /app

# Copy binary from builder
COPY --from=builder /bin/order-service ./order-service

# Set proper permissions
RUN chmod 755 ./order-service

# Run as non-root
USER appuser

# Expose port
EXPOSE 8083

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:8083/health || exit 1

ENTRYPOINT ["./order-service"]
