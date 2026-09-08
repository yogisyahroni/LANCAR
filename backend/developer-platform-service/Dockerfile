# Developer Platform — public scoped API and webhook delivery service.
FROM mirror.gcr.io/golang:1.26.6-alpine AS builder

RUN apk add --no-cache ca-certificates git
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /bin/developer-platform ./cmd/api

FROM mirror.gcr.io/alpine:3.22
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates tzdata && \
    addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /bin/developer-platform ./developer-platform
USER appuser:appgroup
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:8090/health >/dev/null || exit 1
ENTRYPOINT ["./developer-platform"]
