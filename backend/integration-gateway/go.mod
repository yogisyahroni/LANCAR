module tembus/integration-gateway

go 1.26.6

require (
	github.com/getsentry/sentry-go v0.48.0
	github.com/google/uuid v1.6.0
	github.com/joho/godotenv v1.5.1
	github.com/lib/pq v1.12.3
)

require (
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.40.0 // indirect
	tembus/pkg/resilience v0.0.0
)

replace tembus/pkg/resilience => ../pkg/resilience
