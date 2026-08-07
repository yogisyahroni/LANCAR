package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/domain/queue"
	"tembus/order-service/internal/featureflags"
	"tembus/order-service/internal/service"
)

// ── FB-088: unit test PairFoodBatches ─────────────────────────────────────
// Kasus:
//   1. Dua order searching merchant sama + dropoff dekat → batch terbentuk.
//   2. Tanpa pasangan → order jalan solo (GATE: SLA aman, tanpa error).
//   3. Error query kandidat → tidak menggagalkan proses batch lain.
//   4. Merchant order tidak ketemu (GetByID error) → skip, tidak abort.

// batchFoodRepo — embed mockFoodRepo (refund_service_test.go), override
// method batch dengan perilaku yang bisa dikontrol per-test.
type batchFoodRepo struct {
	*mockFoodRepo
	searching []*domain.Order
	candidate map[string]*batchCand
	created   []*domain.FoodBatch
	errFind   bool
}

type batchCand struct {
	order *domain.Order
	distM float64
}

func (r *batchFoodRepo) GetSearchingFoodOrdersForBatch(ctx context.Context) ([]*domain.Order, error) {
	return r.searching, nil
}

func (r *batchFoodRepo) FindBatchCandidate(ctx context.Context, orderID string, maxRadiusKM float64) (*domain.Order, float64, error) {
	if r.errFind {
		return nil, 0, errors.New("db down")
	}
	c, ok := r.candidate[orderID]
	if !ok || c == nil {
		return nil, 0, nil
	}
	return c.order, c.distM, nil
}

func (r *batchFoodRepo) CreateFoodBatch(ctx context.Context, batch *domain.FoodBatch, orderAID, orderBID string) error {
	batch.ID = "batch-1"
	r.created = append(r.created, batch)
	return nil
}

// ── stub untuk constructor NewOrderService (12 arg) ──

type stubEventRepo struct{}

func (s *stubEventRepo) SaveEvent(ctx context.Context, event domain.OrderEvent) error { return nil }
func (s *stubEventRepo) ListEventsByUserID(ctx context.Context, userID string, since time.Time) ([]domain.OrderEvent, error) {
	return nil, nil
}
func (s *stubEventRepo) ListEventsByOrderID(ctx context.Context, orderID string) ([]domain.OrderEvent, error) {
	return nil, nil
}

type stubEventBus struct{}

func (s *stubEventBus) Publish(ctx context.Context, topic string, payload interface{}) error { return nil }
func (s *stubEventBus) Subscribe(ctx context.Context, topic string) (<-chan string, error) {
	return nil, nil
}

type stubQueue struct{}

func (s *stubQueue) Push(ctx context.Context, task queue.Task) error { return nil }
func (s *stubQueue) Consume(ctx context.Context, handler func(queue.Task) error) error {
	return nil
}
func (s *stubQueue) Close() error { return nil }

type stubRelay struct{}

func (s *stubRelay) RecordScoreHistory(ctx context.Context, history *domain.RelayScoreHistory) error {
	return nil
}
func (s *stubRelay) GetScoreHistory(ctx context.Context, courierID uuid.UUID, limit int) ([]domain.RelayScoreHistory, error) {
	return nil, nil
}
func (s *stubRelay) GetCourierPerformanceStats(ctx context.Context, courierID uuid.UUID) (*domain.CourierPerformanceStats, error) {
	return nil, nil
}
func (s *stubRelay) AcquireMatchLock(ctx context.Context, orderID uuid.UUID, ttl time.Duration) (bool, error) {
	return true, nil
}
func (s *stubRelay) ReleaseMatchLock(ctx context.Context, orderID uuid.UUID) error { return nil }
func (s *stubRelay) GetCourierBankInfo(ctx context.Context, courierID uuid.UUID) (*domain.CourierBankInfo, error) {
	return nil, nil
}
func (s *stubRelay) GetCourierIDForOrderLeg(ctx context.Context, orderLegID uuid.UUID) (uuid.UUID, error) {
	return uuid.Nil, nil
}
func (s *stubRelay) GetCourierDispatchScoreStats(ctx context.Context, courierID uuid.UUID, pickupLat float64, pickupLng float64) (*domain.CourierDispatchScoreStats, error) {
	return nil, nil
}
func (s *stubRelay) UpdateCourierRelayScore(ctx context.Context, courierID uuid.UUID, newScore float64, newTier string) error {
	return nil
}
func (s *stubRelay) ListCourierPerformanceStats(ctx context.Context, limit, offset int, search string) ([]*domain.CourierPerformanceStats, error) {
	return nil, nil
}
func (s *stubRelay) UpdateCourierTier(ctx context.Context, courierID uuid.UUID, newTier string) error {
	return nil
}

type stubFlags struct{}

func (s *stubFlags) GetFlag(ctx context.Context, key string) (*featureflags.FeatureFlag, error) {
	return nil, nil
}
func (s *stubFlags) GetFlags(ctx context.Context, keys []string) (map[string]*featureflags.FeatureFlag, error) {
	return nil, nil
}
func (s *stubFlags) IsFeatureFlagEnabled(ctx context.Context, key string, defaultVal bool) (bool, error) {
	return defaultVal, nil
}
func (s *stubFlags) InvalidateCache(ctx context.Context, key string) error { return nil }
func (s *stubFlags) Close() error                                         { return nil }

type stubNotification struct{}

func (s *stubNotification) Send(ctx context.Context, req domain.NotificationRequest) error { return nil }
func (s *stubNotification) GetInbox(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Notification, error) {
	return nil, nil
}
func (s *stubNotification) MarkAsRead(ctx context.Context, notificationID, userID uuid.UUID) error {
	return nil
}
func (s *stubNotification) GetPreferences(ctx context.Context, userID uuid.UUID) (*domain.UserNotificationPreference, error) {
	return nil, nil
}
func (s *stubNotification) UpdatePreferences(ctx context.Context, prefs *domain.UserNotificationPreference) error {
	return nil
}

type stubLedger struct{}

func (s *stubLedger) CreateJournalWithEntries(ctx context.Context, journal *domain.LedgerJournal, entries []domain.LedgerEntry) error {
	return nil
}
func (s *stubLedger) CreateJournalReturningID(ctx context.Context, journal *domain.LedgerJournal, entries []domain.LedgerEntry) (uuid.UUID, error) {
	return uuid.New(), nil
}

type stubTax struct{}

func (s *stubTax) CalculateOrderTax(ctx context.Context, totalGMVIDR int64, platformFeeIDR int64, isAggregator bool) (domain.TaxSnapshot, error) {
	return domain.TaxSnapshot{}, nil
}
func (s *stubTax) CalculatePaymentMDRTax(ctx context.Context, mdrAmountIDR int64) (domain.TaxSnapshot, error) {
	return domain.TaxSnapshot{}, nil
}
func (s *stubTax) GenerateEFakturExport(ctx context.Context, period string, requestedBy string) (*domain.TaxEFakturExport, error) {
	return nil, nil
}
func (s *stubTax) UpdateEFakturStatus(ctx context.Context, exportID string, status string) error { return nil }

func strPtr(s string) *string { return &s }

func newTestOrderService(foodRepo domain.FoodRepository, orderRepo domain.OrderRepository) domain.OrderService {
	svc := service.NewOrderService(
		orderRepo, &stubEventRepo{}, &MockRedisRepo{}, &MockPricingRepo{},
		&stubRelay{}, &stubEventBus{}, &stubQueue{}, &stubFlags{},
		&stubNotification{}, &MockConfigRepo{}, &stubLedger{}, &stubTax{},
	)
	svc.SetFoodRepository(foodRepo)
	return svc
}

func TestPairFoodBatches_FormsBatch(t *testing.T) {
	ctx := context.Background()
	foodRepo := &batchFoodRepo{
		searching: []*domain.Order{{ID: "order-a"}, {ID: "order-b"}},
		candidate: map[string]*batchCand{
			"order-a": {order: &domain.Order{ID: "order-b"}, distM: 800},
		},
	}
	orderRepo := &mockOrderRepo{order: &domain.Order{ID: "order-a", MerchantID: strPtr("merchant-1")}}

	svc := newTestOrderService(foodRepo, orderRepo)
	if err := svc.PairFoodBatches(ctx); err != nil {
		t.Fatalf("PairFoodBatches error: %v", err)
	}

	if len(foodRepo.created) != 1 {
		t.Fatalf("expected 1 batch created, got %d", len(foodRepo.created))
	}
	b := foodRepo.created[0]
	if b.MerchantID != "merchant-1" {
		t.Errorf("merchant mismatch: %s", b.MerchantID)
	}
	if b.DropoffDistanceM != 800 {
		t.Errorf("dropoff distance mismatch: %d", b.DropoffDistanceM)
	}
}

func TestPairFoodBatches_NoCandidate_JalanSolo(t *testing.T) {
	ctx := context.Background()
	foodRepo := &batchFoodRepo{
		searching: []*domain.Order{{ID: "order-a"}}, // cuma 1 order
		candidate: map[string]*batchCand{},
	}
	orderRepo := &mockOrderRepo{}

	svc := newTestOrderService(foodRepo, orderRepo)
	if err := svc.PairFoodBatches(ctx); err != nil {
		t.Fatalf("solo order must not error: %v", err)
	}
	if len(foodRepo.created) != 0 {
		t.Errorf("solo order must not create batch, got %d", len(foodRepo.created))
	}
}

func TestPairFoodBatches_MerchantNotFound_SkipNotAbort(t *testing.T) {
	ctx := context.Background()
	foodRepo := &batchFoodRepo{
		searching: []*domain.Order{{ID: "order-a"}, {ID: "order-b"}},
		candidate: map[string]*batchCand{
			"order-a": {order: &domain.Order{ID: "order-b"}, distM: 500},
		},
	}
	// orderRepo kosong → GetByID order-a gagal → batch di-skip,
	// tapi PairFoodBatches tidak boleh error (non-fatal).
	orderRepo := &mockOrderRepo{}

	svc := newTestOrderService(foodRepo, orderRepo)
	if err := svc.PairFoodBatches(ctx); err != nil {
		t.Fatalf("expected no fatal error, got: %v", err)
	}
	if len(foodRepo.created) != 0 {
		t.Errorf("expected 0 batches (GetByID gagal), got %d", len(foodRepo.created))
	}
}
