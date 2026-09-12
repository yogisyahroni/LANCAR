FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/search-service ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/search-service /search-service
EXPOSE 8092
USER nonroot:nonroot
ENTRYPOINT ["/search-service"]
