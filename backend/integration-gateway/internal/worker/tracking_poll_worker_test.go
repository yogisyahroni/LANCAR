package worker

import (
	"context"
	"testing"

	"tembus/integration-gateway/internal/domain"
	"tembus/integration-gateway/internal/provider"
)

type pollTargetSourceStub struct{ targets []domain.TrackingPollTarget }

func (s pollTargetSourceStub) ListTrackingPollTargets(context.Context) ([]domain.TrackingPollTarget, error) {
	return s.targets, nil
}

type pollEventSinkStub struct{ events []domain.CarrierEvent }

func (s *pollEventSinkStub) PublishCarrierEvent(_ context.Context, event domain.CarrierEvent) error {
	s.events = append(s.events, event)
	return nil
}

type pollTrackingStub struct{}

func (pollTrackingStub) TrackOrder(context.Context, string) (*domain.TrackingResponse, error) {
	return &domain.TrackingResponse{
		AWBNumber: "AWB-1",
		Status:    "IN_TRANSIT",
		History: []domain.TrackingEvent{{
			Timestamp: "2026-09-01T10:00:00Z",
			Status:    "IN_TRANSIT",
			Location:  "Jakarta",
			Note:      "Shipment bergerak",
		}},
	}, nil
}

func TestTrackingPollWorkerPollsPullOnlyProviderAndPublishesCanonicalEvent(t *testing.T) {
	registry := provider.NewLogisticsProviderRegistry()
	registry.Register(domain.ProviderRegistration{
		Descriptor: domain.ProviderDescriptor{Code: "pull-only", Name: "Pull Only", Capabilities: []domain.LogisticsCapability{domain.CapabilityTracking}},
		Tracking:   pollTrackingStub{},
	})
	sink := &pollEventSinkStub{}
	worker := NewTrackingPollWorker(
		pollTargetSourceStub{targets: []domain.TrackingPollTarget{{Provider: "pull-only", AWB: "AWB-1"}}},
		sink,
		registry,
		0,
		false,
	)

	if err := worker.RunOnce(context.Background()); err != nil {
		t.Fatalf("run poll worker: %v", err)
	}
	if len(sink.events) != 1 {
		t.Fatalf("expected one published event, got %d", len(sink.events))
	}
	if sink.events[0].CanonicalStatus != "IN_TRANSIT" || sink.events[0].EventID == "" || sink.events[0].RawPayload == "" {
		t.Fatalf("expected canonical raw-preserving event, got %#v", sink.events[0])
	}
}

func TestTrackingPollWorkerSkipsWebhookProviderUnlessReconciliationEnabled(t *testing.T) {
	registry := provider.NewLogisticsProviderRegistry()
	registry.Register(domain.ProviderRegistration{
		Descriptor: domain.ProviderDescriptor{Code: "webhook", Name: "Webhook", Capabilities: []domain.LogisticsCapability{domain.CapabilityTracking, domain.CapabilityWebhook}},
		Tracking:   pollTrackingStub{},
		Webhook:    provider.NewGenericWebhookAdapter("webhook"),
	})
	targets := pollTargetSourceStub{targets: []domain.TrackingPollTarget{{Provider: "webhook", AWB: "AWB-1"}}}

	skippedSink := &pollEventSinkStub{}
	if err := NewTrackingPollWorker(targets, skippedSink, registry, 0, false).RunOnce(context.Background()); err != nil {
		t.Fatalf("run webhook-primary poll worker: %v", err)
	}
	if len(skippedSink.events) != 0 {
		t.Fatal("webhook-capable provider must not be polled as primary")
	}

	reconcileSink := &pollEventSinkStub{}
	if err := NewTrackingPollWorker(targets, reconcileSink, registry, 0, true).RunOnce(context.Background()); err != nil {
		t.Fatalf("run reconciliation poll worker: %v", err)
	}
	if len(reconcileSink.events) != 1 {
		t.Fatalf("expected reconciliation event, got %d", len(reconcileSink.events))
	}
}
