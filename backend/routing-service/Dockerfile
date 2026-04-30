# ============================================================
# Routing Service — Multi-Stage Dockerfile (Hardened)
# ============================================================

# Stage 1: Builder
FROM golang:1.24.3-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -ldflags="-s -w -extldflags '-static'" \
    -trimpath \
    -o /bin/routing-service \
    ./main.go

# Stage 2: Final
FROM alpine:3.20

RUN apk --no-cache add ca-certificates tzdata && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    mkdir -p /app && chown appuser:appgroup /app

WORKDIR /app

COPY --from=builder /bin/routing-service ./routing-service
RUN chmod 550 ./routing-service

USER appuser

EXPOSE 8082

ENTRYPOINT ["./routing-service"]
