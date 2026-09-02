package service

import (
	"context"
	"tembus/order-service/internal/domain"
	"testing"
	"time"

	"github.com/google/uuid"
)

type carrierEventRepositoryStub struct{ inserted bool }

func (s *carrierEventRepositoryStub) InsertIfNew(context.Context, *domain.CarrierEvent) (bool, error) {
	if s.inserted {
		return false, nil
	}
	s.inserted = true
	return true, nil
}

type carrierEventOrderRepositoryStub struct {
	order        *domain.Order
	updatedID    string
	updatedState domain.OrderStatus
}

func (s *carrierEventOrderRepositoryStub) GetByAWB(context.Context, string) (*domain.Order, error) {
	return s.order, nil
}

func (s *carrierEventOrderRepositoryStub) UpdateStatus(_ context.Context, id string, status domain.OrderStatus) error {
	s.updatedID, s.updatedState = id, status
	return nil
}

type carrierEventOrderEventsStub struct{ saved []domain.OrderEvent }

func (s *carrierEventOrderEventsStub) SaveEvent(_ context.Context, event domain.OrderEvent) error {
	s.saved = append(s.saved, event)
	return nil
}
func (s *carrierEventOrderEventsStub) ListEventsByUserID(context.Context, string, time.Time) ([]domain.OrderEvent, error) {
	return nil, nil
}
func (s *carrierEventOrderEventsStub) ListEventsByOrderID(context.Context, string) ([]domain.OrderEvent, error) {
	return nil, nil
}

type carrierAcceptanceRecorder struct {
	event domain.CarrierAcceptanceEvent
	calls int
}

func (s *carrierAcceptanceRecorder) CreateAWB(context.Context, string, domain.AWBRequest) (*domain.AWBAttempt, error) {
	return nil, nil
}
func (s *carrierAcceptanceRecorder) RecordHandoff(context.Context, domain.RecordCarrierHandoffRequest) (*domain.CarrierHandoff, error) {
	return nil, nil
}
func (s *carrierAcceptanceRecorder) ApplyCarrierAcceptance(_ context.Context, event domain.CarrierAcceptanceEvent) error {
	s.calls++
	s.event = event
	return nil
}

func TestCanonicalCarrierStatusDoesNotGuessUnknown(t *testing.T) {
	if status, ok := canonicalOrderStatus("PROVIDER_ONLY_STATE"); ok || status != "" {
		t.Fatalf("unknown provider state must remain unmapped: %q %v", status, ok)
	}
}

func TestCarrierStatusRankPreventsRegression(t *testing.T) {
	if statusCanAdvance(domain.StatusDelivering, domain.StatusPickedUp) {
		t.Fatal("picked_up must not regress delivering")
	}
	if !statusCanAdvance(domain.StatusPickedUp, domain.StatusDelivering) {
		t.Fatal("delivering should advance picked_up")
	}
}

func TestCarrierAcceptanceEventDrivesLifecycleAndRecordsProviderReference(t *testing.T) {
	eventRepo := &carrierEventRepositoryStub{}
	orderRepo := &carrierEventOrderRepositoryStub{order: &domain.Order{ID: "order-1", Status: domain.StatusPending}}
	orderEvents := &carrierEventOrderEventsStub{}
	acceptance := &carrierAcceptanceRecorder{}
	svc := NewCarrierEventService(eventRepo, orderRepo, orderEvents, acceptance)
	receivedAt := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)

	err := svc.Process(context.Background(), &domain.CarrierEvent{
		Provider: "jne", EventID: "jne-event-1", AWBNumber: "JNE-1",
		CanonicalStatus: "HANDED_TO_CARRIER", RawStatus: "HANDOVER",
		ReceivedAt: receivedAt,
	})
	if err != nil {
		t.Fatalf("process acceptance event: %v", err)
	}
	if acceptance.calls != 1 || acceptance.event.ProviderRef != "jne-event-1" {
		t.Fatalf("provider acceptance was not forwarded with event reference: %+v", acceptance)
	}
	if orderRepo.updatedID != "order-1" || orderRepo.updatedState != domain.StatusDelivering {
		t.Fatalf("carrier acceptance did not drive normalized lifecycle: %s %s", orderRepo.updatedID, orderRepo.updatedState)
	}
	if len(orderEvents.saved) != 1 || orderEvents.saved[0].Status != domain.StatusDelivering {
		t.Fatalf("normalized lifecycle event was not audited: %+v", orderEvents.saved)
	}
}

func TestCarrierAcceptanceEventDoesNotBlockNonAggregatorLifecycle(t *testing.T) {
	eventRepo := &carrierEventRepositoryStub{}
	orderRepo := &carrierEventOrderRepositoryStub{order: &domain.Order{ID: "order-2", Status: domain.StatusPending}}
	orderEvents := &carrierEventOrderEventsStub{}

	// A missing AWB attempt is a valid condition for legacy/non-aggregator
	// orders; the carrier event must still advance the normalized lifecycle.
	missing := &carrierAcceptanceMissingAttempt{}
	svc := NewCarrierEventService(eventRepo, orderRepo, orderEvents, missing)
	err := svc.Process(context.Background(), &domain.CarrierEvent{
		Provider: "jne", EventID: "jne-event-2", AWBNumber: "JNE-2",
		CanonicalStatus: "IN_TRANSIT", RawStatus: "IN_TRANSIT", ReceivedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("missing aggregator attempt must not block event: %v", err)
	}
	if orderRepo.updatedState != domain.StatusDelivering {
		t.Fatalf("non-aggregator event did not advance lifecycle: %s", orderRepo.updatedState)
	}
}

type carrierFinanceRecorder struct {
	claims []*domain.LogisticsExceptionClaim
}

func (s *carrierFinanceRecorder) CreateInvoice(context.Context, *domain.ProviderInvoice, []domain.ProviderInvoiceItem) error {
	return nil
}
func (s *carrierFinanceRecorder) ReconcileInvoice(context.Context, uuid.UUID) (*domain.ProviderInvoice, error) {
	return nil, nil
}
func (s *carrierFinanceRecorder) ApproveInvoice(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}
func (s *carrierFinanceRecorder) SubmitClaim(_ context.Context, claim *domain.LogisticsExceptionClaim) (*domain.LogisticsExceptionClaim, error) {
	s.claims = append(s.claims, claim)
	return claim, nil
}
func (s *carrierFinanceRecorder) ResolveClaim(context.Context, uuid.UUID, string) error { return nil }

func TestCarrierExceptionEventCreatesPolicyClaimBeforeLifecycleUpdate(t *testing.T) {
	orderID := uuid.New()
	eventRepo := &carrierEventRepositoryStub{}
	orderRepo := &carrierEventOrderRepositoryStub{order: &domain.Order{
		ID: orderID.String(), Status: domain.StatusDelivering, LogisticsTariffIDR: 27500,
	}}
	orderEvents := &carrierEventOrderEventsStub{}
	finance := &carrierFinanceRecorder{}
	svc := NewCarrierEventServiceWithDependencies(eventRepo, orderRepo, orderEvents, nil, finance)

	err := svc.Process(context.Background(), &domain.CarrierEvent{
		Provider: "jne", EventID: "jne-return-1", AWBNumber: "JNE-RETURN-1",
		CanonicalStatus: "RETURN_TO_SENDER", RawStatus: "RTS", ReceivedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("process return event: %v", err)
	}
	if len(finance.claims) != 1 {
		t.Fatalf("expected one automatic exception claim, got %d", len(finance.claims))
	}
	claim := finance.claims[0]
	if claim.OrderID != orderID || claim.ExceptionType != "RETURN" || claim.ProviderName != "jne" || claim.ClaimAmountIDR != 27500 {
		t.Fatalf("unexpected automatic return claim: %+v", claim)
	}
	if orderRepo.updatedState != domain.StatusReturnToSender {
		t.Fatalf("return event did not update normalized lifecycle: %s", orderRepo.updatedState)
	}
}

func TestCarrierExceptionTypeDoesNotGuessUnrelatedStatuses(t *testing.T) {
	if got := carrierExceptionType("DELIVERED"); got != "" {
		t.Fatalf("delivered must not create exception claim: %q", got)
	}
	if got := carrierExceptionType("DAMAGED"); got != "" {
		t.Fatalf("damaged requires evidence-backed manual claim intake: %q", got)
	}
}

type carrierAcceptanceMissingAttempt struct{}

func (carrierAcceptanceMissingAttempt) CreateAWB(context.Context, string, domain.AWBRequest) (*domain.AWBAttempt, error) {
	return nil, nil
}
func (carrierAcceptanceMissingAttempt) RecordHandoff(context.Context, domain.RecordCarrierHandoffRequest) (*domain.CarrierHandoff, error) {
	return nil, nil
}
func (carrierAcceptanceMissingAttempt) ApplyCarrierAcceptance(context.Context, domain.CarrierAcceptanceEvent) error {
	return domain.ErrAWBAttemptNotFound
}
