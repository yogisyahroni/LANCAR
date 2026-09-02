package service

import (
	"context"
	"testing"
	"tembus/order-service/internal/domain"
	"time"
)

type carrierHandoffRepoStub struct {
	attempt *domain.AWBAttempt
	handoff *domain.CarrierHandoff
	failed string
	accepted bool
}

func (r *carrierHandoffRepoStub) GetAWBAttemptByOrder(context.Context, string) (*domain.AWBAttempt, error) { return r.attempt, nil }
func (r *carrierHandoffRepoStub) GetAWBAttemptByAWB(context.Context, string, string) (*domain.AWBAttempt, error) { return r.attempt, nil }
func (r *carrierHandoffRepoStub) CreateAWBAttempt(_ context.Context, attempt *domain.AWBAttempt) (*domain.AWBAttempt, error) {
	if r.attempt != nil { return r.attempt, nil }
	r.attempt = attempt
	return r.attempt, nil
}
func (r *carrierHandoffRepoStub) MarkAWBCreated(_ context.Context, _, awb, tracking string) error {
	r.attempt.Status, r.attempt.AWBNumber, r.attempt.TrackingURL = domain.AWBCreationCreated, awb, tracking
	return nil
}
func (r *carrierHandoffRepoStub) MarkAWBFailed(_ context.Context, _, message string) error {
	r.failed = message
	r.attempt.Status = domain.AWBCreationFailed
	return nil
}
func (r *carrierHandoffRepoStub) CreateCarrierHandoff(_ context.Context, handoff *domain.CarrierHandoff) (*domain.CarrierHandoff, error) {
	if r.handoff != nil { return r.handoff, nil }
	r.handoff = handoff
	return handoff, nil
}
func (r *carrierHandoffRepoStub) MarkCarrierAccepted(context.Context, string, string, time.Time) error {
	r.accepted = true
	return nil
}

type carrierHandoffAWBStub struct { calls int; err error }
func (c *carrierHandoffAWBStub) CreateAWB(context.Context, domain.AWBRequest) (*domain.AWBResponse, error) {
	c.calls++
	if c.err != nil { return nil, c.err }
	return &domain.AWBResponse{AWBNumber: "JNE123", Provider: "jne", TrackingURL: "https://track.test/JNE123"}, nil
}
func (*carrierHandoffAWBStub) SendWhatsApp(context.Context, string, string) error { return nil }
func (*carrierHandoffAWBStub) CheckTariff(context.Context, domain.CheckTariffRequest) (*domain.CheckTariffResponse, error) { return nil, nil }

type carrierHandoffConfigStub struct{}
func (carrierHandoffConfigStub) GetConfig(context.Context, string) (*domain.SystemConfig, error) { return nil, nil }
func (carrierHandoffConfigStub) GetFloatConfig(context.Context, string, float64) float64 { return 1 }
func (carrierHandoffConfigStub) GetIntConfig(context.Context, string, int) int { return 0 }
func (carrierHandoffConfigStub) GetStringConfig(_ context.Context, key, fallback string) string {
	switch key {
	case "awb_jne_first_mile_mode": return "lancar_pickup"
	case "awb_jne_first_mile_modes": return `["lancar_pickup","provider_pickup","customer_dropoff"]`
	default: return fallback
	}
}

func TestCarrierHandoffCreateAWBIsIdempotentAfterProviderSuccess(t *testing.T) {
	repo := &carrierHandoffRepoStub{}
	provider := &carrierHandoffAWBStub{}
	svc := NewCarrierHandoffService(repo, provider, nil, carrierHandoffConfigStub{})
	request := domain.AWBRequest{Provider: "jne"}

	first, err := svc.CreateAWB(context.Background(), "order-1", request)
	if err != nil { t.Fatalf("first create: %v", err) }
	second, err := svc.CreateAWB(context.Background(), "order-1", request)
	if err != nil { t.Fatalf("second create: %v", err) }
	if first.AWBNumber != second.AWBNumber || provider.calls != 1 {
		t.Fatalf("expected one provider call and same AWB, calls=%d first=%q second=%q", provider.calls, first.AWBNumber, second.AWBNumber)
	}
}

func TestCarrierHandoffLancarPickupRequiresProof(t *testing.T) {
	repo := &carrierHandoffRepoStub{attempt: &domain.AWBAttempt{ID: "attempt-1", OrderID: "order-1", Provider: "jne", FirstMileMode: domain.FirstMileLancarPickup, Status: domain.AWBCreationCreated, AWBNumber: "JNE123"}}
	svc := NewCarrierHandoffService(repo, nil, nil, carrierHandoffConfigStub{})
	_, err := svc.RecordHandoff(context.Background(), domain.RecordCarrierHandoffRequest{OrderID: "order-1", AWBNumber: "JNE123", ActorID: "courier-1"})
	if err == nil { t.Fatal("expected missing location/evidence to be rejected") }

	lat, lng := -6.2, 106.8
	handoff, err := svc.RecordHandoff(context.Background(), domain.RecordCarrierHandoffRequest{
		OrderID: "order-1", AWBNumber: "JNE123", ActorID: "courier-1", ActorType: "courier",
		LocationLat: &lat, LocationLng: &lng, EvidenceURLs: []string{"https://cdn.test/proof.jpg"},
	})
	if err != nil { t.Fatalf("record proof handoff: %v", err) }
	if handoff.FirstMileMode != domain.FirstMileLancarPickup || repo.handoff == nil { t.Fatal("handoff was not persisted") }
}

func TestCarrierHandoffProviderAcceptanceRequiresKnownAWB(t *testing.T) {
	repo := &carrierHandoffRepoStub{}
	svc := NewCarrierHandoffService(repo, nil, nil, carrierHandoffConfigStub{})
	if err := svc.ApplyCarrierAcceptance(context.Background(), domain.CarrierAcceptanceEvent{Provider: "jne", AWBNumber: "missing"}); err == nil {
		t.Fatal("expected unknown AWB to be rejected")
	}
}
