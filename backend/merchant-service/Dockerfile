# ============================================================
# Merchant Service — Multi-Stage Dockerfile (Hardened)
# Ikut pola auth-service (mirror GCR untuk build cepat di Indonesia)
# ============================================================

# Stage 1: Builder
FROM mirror.gcr.io/golang:1.25.12-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Copy dependency files first (better layer caching)
COPY go.mod go.sum ./
RUN go mod tidy && go mod download && go mod verify

# Copy source
COPY . .

# Build: CGO disabled, stripped binary (-s -w = no debug info, smaller size)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -ldflags="-s -w -extldflags '-static'" \
    -trimpath \
    -o /bin/merchant-service \
    ./cmd/api/main.go

# Stage 2: Final (minimal attack surface)
FROM mirror.gcr.io/alpine:3.22

# Runtime deps: ca-certificates (HTTPS outbound), tzdata (timezones)
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S appuser && adduser -S -G appuser appuser

WORKDIR /app

# Copy binary
COPY --from=builder /bin/merchant-service ./merchant-service

# Set proper permissions
RUN chmod 755 ./merchant-service

# Run as non-root
USER appuser

# Expose port
EXPOSE 8085

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:8085/health || exit 1

ENTRYPOINT ["./merchant-service"]
