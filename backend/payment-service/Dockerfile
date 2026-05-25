# ============================================================
# Payment Service — Multi-Stage Dockerfile (Hardened)
# ============================================================

# Stage 1: Builder
FROM golang:1.25.10-alpine AS builder

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
    -o /bin/payment-service \
    ./cmd/api/main.go

# Stage 2: Final (minimal attack surface)
FROM alpine:3.22

# Security: add ca-certs + timezone data
RUN apk --no-cache add ca-certificates tzdata && \
    # Create non-root user
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    # Create app directory
    mkdir -p /app && chown appuser:appgroup /app

WORKDIR /app

# Copy binary from builder
COPY --from=builder /bin/payment-service ./payment-service

# Set proper permissions
RUN chmod 755 ./payment-service

# Run as non-root
USER appuser

# Expose port
EXPOSE 8084

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:8084/health || exit 1

ENTRYPOINT ["./payment-service"]
