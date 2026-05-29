package observability

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

const defaultOTLPEndpoint = "http://otel-collector:4318"

func InitTracing(ctx context.Context, defaultServiceName string) (func(context.Context) error, error) {
	if !strings.EqualFold(strings.TrimSpace(os.Getenv("OTEL_ENABLED")), "true") {
		return func(context.Context) error { return nil }, nil
	}

	protocol := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_PROTOCOL"))
	if protocol == "" {
		protocol = "http/protobuf"
	}
	if !strings.EqualFold(protocol, "http/protobuf") {
		return nil, fmt.Errorf("unsupported OTEL_EXPORTER_OTLP_PROTOCOL %q for routing-service; use http/protobuf", protocol)
	}

	endpoint := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	if endpoint == "" {
		endpoint = defaultOTLPEndpoint
	}
	if err := validateCollectorEndpoint(endpoint); err != nil {
		return nil, err
	}

	exporter, err := otlptracehttp.New(ctx, otlptracehttp.WithEndpointURL(endpoint))
	if err != nil {
		return nil, fmt.Errorf("initialize OTLP trace exporter: %w", err)
	}

	serviceName := strings.TrimSpace(os.Getenv("OTEL_SERVICE_NAME"))
	if serviceName == "" {
		serviceName = defaultServiceName
	}
	deploymentEnvironment := strings.TrimSpace(os.Getenv("OTEL_DEPLOYMENT_ENVIRONMENT"))
	if deploymentEnvironment == "" {
		deploymentEnvironment = strings.TrimSpace(os.Getenv("ENVIRONMENT"))
	}
	if deploymentEnvironment == "" {
		deploymentEnvironment = "development"
	}

	serviceResource, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			"",
			attribute.String("service.name", serviceName),
			attribute.String("deployment.environment", deploymentEnvironment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("initialize trace resource: %w", err)
	}

	provider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(serviceResource),
		sdktrace.WithSampler(buildSampler()),
	)
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

	return provider.Shutdown, nil
}

func HTTPHandler(handler http.Handler, operation string) http.Handler {
	return otelhttp.NewHandler(handler, operation,
		otelhttp.WithFilter(func(r *http.Request) bool {
			return r.URL.Path != "/health" && r.URL.Path != "/metrics"
		}),
		otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string {
			return r.Method + " " + r.URL.Path
		}),
	)
}

func CurrentTraceContext(ctx context.Context) (string, string, string) {
	spanContext := trace.SpanContextFromContext(ctx)
	if !spanContext.IsValid() {
		return "", "", ""
	}
	traceparent := fmt.Sprintf(
		"00-%s-%s-%02x",
		spanContext.TraceID().String(),
		spanContext.SpanID().String(),
		byte(spanContext.TraceFlags()),
	)
	return traceparent, spanContext.TraceID().String(), spanContext.SpanID().String()
}

func AnnotateRequest(ctx context.Context, requestID string) {
	if requestID == "" {
		return
	}
	span := trace.SpanFromContext(ctx)
	if !span.SpanContext().IsValid() {
		return
	}
	span.SetAttributes(attribute.String("request.id", requestID))
}

func buildSampler() sdktrace.Sampler {
	samplerName := strings.ToLower(strings.TrimSpace(os.Getenv("OTEL_TRACES_SAMPLER")))
	switch samplerName {
	case "always_on":
		return sdktrace.AlwaysSample()
	case "always_off":
		return sdktrace.NeverSample()
	case "", "traceidratio", "parentbased_traceidratio":
		ratio := 1.0
		if rawRatio := strings.TrimSpace(os.Getenv("OTEL_TRACES_SAMPLER_ARG")); rawRatio != "" {
			if parsedRatio, err := strconv.ParseFloat(rawRatio, 64); err == nil {
				ratio = parsedRatio
			}
		}
		if ratio < 0 {
			ratio = 0
		}
		if ratio > 1 {
			ratio = 1
		}
		return sdktrace.ParentBased(sdktrace.TraceIDRatioBased(ratio))
	default:
		return sdktrace.ParentBased(sdktrace.TraceIDRatioBased(1.0))
	}
}

func validateCollectorEndpoint(endpoint string) error {
	parsedURL, err := url.Parse(endpoint)
	if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
		return fmt.Errorf("OTEL_EXPORTER_OTLP_ENDPOINT must be a full internal HTTP URL")
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return fmt.Errorf("OTEL_EXPORTER_OTLP_ENDPOINT must use http or https")
	}
	if isProductionRuntime() && isLocalhostHost(parsedURL.Hostname()) {
		return fmt.Errorf("OTEL_EXPORTER_OTLP_ENDPOINT must not point to localhost in production")
	}
	return nil
}

func isProductionRuntime() bool {
	return strings.EqualFold(os.Getenv("ENVIRONMENT"), "production") ||
		strings.EqualFold(os.Getenv("NODE_ENV"), "production")
}

func isLocalhostHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	return host == "localhost" || host == "127.0.0.1" || host == "::1" || strings.HasPrefix(host, "127.")
}

func ShutdownWithTimeout(shutdown func(context.Context) error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = shutdown(ctx)
}
