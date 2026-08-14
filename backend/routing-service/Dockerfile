# ============================================================
# Routing Service — Multi-Stage Dockerfile (Hardened)
# ============================================================

# Stage 1: Builder
FROM mirror.gcr.io/golang:1.25.13-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod tidy && go mod download && go mod verify

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -ldflags="-s -w -extldflags '-static'" \
    -trimpath \
    -o /bin/routing-service \
    ./main.go

# Stage 2: Final
FROM mirror.gcr.io/alpine:3.22

# Security patch: upgrade all packages to get latest CVE fixes (CVE-2025-4544 libcrypto)
RUN apk upgrade --no-cache

RUN apk --no-cache add ca-certificates tzdata && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    mkdir -p /app && chown appuser:appgroup /app

WORKDIR /app

COPY --from=builder /bin/routing-service ./routing-service
RUN chmod 755 ./routing-service

USER appuser

EXPOSE 8082

ENTRYPOINT ["./routing-service"]
