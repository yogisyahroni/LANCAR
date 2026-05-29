package observability

import (
	"context"
	"os"
	"testing"
)

func TestInitTracingNoopWhenDisabled(t *testing.T) {
	t.Setenv("OTEL_ENABLED", "false")

	shutdown, err := InitTracing(context.Background(), "routing-service-test")
	if err != nil {
		t.Fatalf("InitTracing() unexpected error: %v", err)
	}
	if shutdown == nil {
		t.Fatal("InitTracing() returned nil shutdown")
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown() unexpected error: %v", err)
	}
}

func TestInitTracingDoesNotDialCollectorAtStartup(t *testing.T) {
	t.Setenv("OTEL_ENABLED", "true")
	t.Setenv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:43181")
	t.Setenv("ENVIRONMENT", "development")

	shutdown, err := InitTracing(context.Background(), "routing-service-test")
	if err != nil {
		t.Fatalf("InitTracing() should not fail just because collector is unavailable: %v", err)
	}
	if shutdown == nil {
		t.Fatal("InitTracing() returned nil shutdown")
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown() unexpected error: %v", err)
	}
}

func TestInitTracingRejectsLocalhostCollectorInProduction(t *testing.T) {
	t.Setenv("OTEL_ENABLED", "true")
	t.Setenv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
	t.Setenv("ENVIRONMENT", "production")
	defer os.Unsetenv("NODE_ENV")

	shutdown, err := InitTracing(context.Background(), "routing-service-test")
	if err == nil {
		if shutdown != nil {
			_ = shutdown(context.Background())
		}
		t.Fatal("InitTracing() accepted localhost collector in production")
	}
}
